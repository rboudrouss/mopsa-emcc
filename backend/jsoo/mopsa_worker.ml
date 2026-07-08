(* mopsa_worker.ml — js_of_ocaml backend worker.
 *
 * Web Worker that runs the Mopsa analysis compiled to pure JavaScript
 * (js_of_ocaml), as a lighter alternative to the WASM backend. Feature
 * differences vs WASM: no C / C+Python analysis (the Clang parser is a
 * C++ library) and no Apron-based relational domains (C library; their
 * primitives raise if a config selects them).
 *
 * The postMessage protocol is the same as backend/wasm/mopsa_worker.js:
 *
 * 1. Batch:
 *      Receives: { type:'analyze', id, options, code, config, codeFile, extraFiles }
 *      Posts:    { type:'result',  id, output }
 *
 * 2. Session (interactive | dap): one long-lived run, stdin fed
 *    synchronously over a SharedArrayBuffer channel (sync-message.js),
 *    stdout/stderr streamed back as raw bytes.
 *      Receives: { type:'start', id, engine, options, code, config, codeFile,
 *                  extraFiles, stdinChannel }
 *      Posts:    { type:'started', id } { type:'stdout-bytes', id, bytes }
 *                { type:'session-ended', id, code } { type:'session-error', id, message }
 *
 * The OCaml runtime state persists across runs, so the API shim
 * (mopsa_api_jsoo.js) respawns the worker after every run to get a
 * fresh analyzer state.
 *
 * The share directory (configs + stubs) is NOT baked into the bundle:
 * the API shim fetches the frontend's share.json (already generated for
 * the presets UI) and passes the relevant files in each message as
 * `shareFiles` (path relative to the share dir → content); they are
 * written under /static/share/mopsa before the run.
 *)

open Js_of_ocaml

let share_dir = "/static/share/mopsa"

(* ── Virtual filesystem helpers ─────────────────────────────────────────── *)

let write_file ~name ~content =
  let open Sys_js in
  try
    let _ = read_file ~name in
    update_file ~name ~content
  with Sys_error _ -> create_file ~name ~content

let setup_files ~code ~config ~code_file ~extra_files ~share_files =
  List.iter
    (fun (path, content) ->
      write_file ~name:(share_dir ^ "/" ^ path) ~content)
    share_files;
  write_file ~name:"/config.json" ~content:config;
  List.iter (fun (path, content) -> write_file ~name:path ~content) extra_files;
  (* code file last so it overrides any stale extraFiles entry *)
  write_file ~name:code_file ~content:code

(* ── Message field access ───────────────────────────────────────────────── *)

let get_str msg field : string = Js.to_string (Js.Unsafe.get msg field)

let get_int msg field : int = int_of_float (Js.float_of_number (Js.Unsafe.get msg field))

let get_options msg : string list =
  let arr : Js.js_string Js.t Js.js_array Js.t = Js.Unsafe.get msg "options" in
  Js.to_array arr |> Array.to_list |> List.map Js.to_string

(* {path → content} JS object field → assoc list *)
let get_file_map msg field : (string * string) list =
  let obj = Js.Unsafe.get msg field in
  if Js.to_string (Js.typeof obj) = "object" then
    Js.object_keys obj |> Js.to_array |> Array.to_list
    |> List.map (fun k -> (Js.to_string k, Js.to_string (Js.Unsafe.get obj k)))
  else []

let post (fields : (string * Js.Unsafe.any) list) =
  Worker.post_message (Js.Unsafe.obj (Array.of_list fields))

let str s = Js.Unsafe.inject (Js.string s)
let num i = Js.Unsafe.inject (Js.number_of_float (float_of_int i))

(* ── Running the analyzer ───────────────────────────────────────────────── *)

let build_argv options =
  let is_help = List.mem "-help" options in
  let base = if is_help then [ "mopsa" ] else [ "mopsa"; "-config"; "/config.json" ] in
  Array.of_list (base @ [ "-share-dir"; share_dir ] @ options)

let run_analysis options : int =
  Mopsa_analyzer.Framework.Runner.parse_options (build_argv options)
    Mopsa_analyzer.Framework.Runner.analyze_files ()

(* ── Batch mode ─────────────────────────────────────────────────────────── *)

let run_batch msg =
  let id = get_int msg "id" in
  let buf = Buffer.create 4096 in
  Sys_js.set_channel_flusher stdout (Buffer.add_string buf);
  Sys_js.set_channel_flusher stderr (Buffer.add_string buf);
  setup_files ~code:(get_str msg "code") ~config:(get_str msg "config")
    ~code_file:(get_str msg "codeFile")
    ~extra_files:(get_file_map msg "extraFiles")
    ~share_files:(get_file_map msg "shareFiles");
  (try
     let (_ : int) = run_analysis (get_options msg) in
     ()
   with e ->
     Buffer.add_string buf
       (Printf.sprintf "\n[jsoo error] %s\n" (Printexc.to_string e)));
  (try flush Stdlib.stdout; flush Stdlib.stderr with _ -> ());
  post [ ("type", str "result"); ("id", num id); ("output", str (Buffer.contents buf)) ]

(* ── Session mode (interactive | dap) ───────────────────────────────────── *)

(* Convert an OCaml string (raw bytes) to a Uint8Array without any
   UTF-8 re-encoding, so DAP Content-Length framing stays byte-exact. *)
let bytes_of_string (s : string) : Js.Unsafe.any =
  let n = String.length s in
  let arr = Js.Unsafe.new_obj Js.Unsafe.global##.Uint8Array [| num n |] in
  for i = 0 to n - 1 do
    Js.Unsafe.set arr i (Char.code s.[i])
  done;
  Js.Unsafe.inject arr

let run_session msg =
  let id = get_int msg "id" in
  let engine = get_str msg "engine" in
  let channel = Js.Unsafe.get msg "stdinChannel" in
  let options = get_options msg @ [ "-engine=" ^ engine ] in

  (try Worker.import_scripts [ "./sync-message.js" ]
   with _ ->
     post
       [ ("type", str "session-error"); ("id", num id);
         ("message", str "cannot load sync-message.js") ]);

  let post_bytes s =
    if String.length s > 0 then
      post [ ("type", str "stdout-bytes"); ("id", num id); ("bytes", bytes_of_string s) ]
  in
  Sys_js.set_channel_flusher stdout post_bytes;
  Sys_js.set_channel_flusher stderr post_bytes;

  (* Synchronous stdin: flush any pending prompt, then block on the
     SharedArrayBuffer channel until the main thread writes a message
     ({data: string} or {eof: true}, cf. mopsa_api sendInput/sendEof). *)
  let msg_id = ref 0 in
  Sys_js.set_channel_filler stdin (fun () ->
      (try flush Stdlib.stdout; flush Stdlib.stderr with _ -> ());
      let m =
        Js.Unsafe.fun_call
          (Js.Unsafe.get (Js.Unsafe.global##.syncMessage) "readMessage")
          [| channel;
             Js.Unsafe.inject (Js.string (string_of_int !msg_id));
             Js.Unsafe.obj [||] |]
      in
      incr msg_id;
      let eof = Js.Optdef.test (Js.Unsafe.get m "eof")
                && Js.to_bool (Js.Unsafe.get m "eof") in
      if eof then "" (* empty string = EOF *)
      else
        let data = Js.Unsafe.get m "data" in
        if Js.Optdef.test data then Js.to_string data else "");

  setup_files ~code:(get_str msg "code") ~config:(get_str msg "config")
    ~code_file:(get_str msg "codeFile")
    ~extra_files:(get_file_map msg "extraFiles")
    ~share_files:(get_file_map msg "shareFiles");

  post [ ("type", str "started"); ("id", num id) ];
  (try
     let code = run_analysis options in
     (try flush Stdlib.stdout; flush Stdlib.stderr with _ -> ());
     post [ ("type", str "session-ended"); ("id", num id); ("code", num code) ]
   with e ->
     (try flush Stdlib.stdout; flush Stdlib.stderr with _ -> ());
     post
       [ ("type", str "session-error"); ("id", num id);
         ("message", str (Printexc.to_string e)) ])

(* ── Dispatch ───────────────────────────────────────────────────────────── *)

let () =
  Printexc.record_backtrace true;
  Worker.set_onmessage (fun msg ->
      match get_str msg "type" with
      | "analyze" -> run_batch msg
      | "start" -> run_session msg
      | _ -> ());
  Console.console##log (Js.string "[Mopsa jsoo Worker] ready")

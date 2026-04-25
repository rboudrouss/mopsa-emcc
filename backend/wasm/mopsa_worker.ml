let () = Printexc.record_backtrace true

let ends_with suffix s =
  let sl = String.length s and xl = String.length suffix in
  sl >= xl && String.sub s (sl - xl) xl = suffix

let is_c_file f = ends_with ".c" f || ends_with ".h" f
let is_py_file f = ends_with ".py" f

(** Generate /mopsa.db from a list of .c/.h source files. *)
let generate_db (c_files : string list) : unit =
  let open Mopsa_build_db in
  let db =
    List.fold_left
      (fun db src ->
        let obj = src ^ ".o" in
        db_compile db SOURCE_C src obj [])
      empty_db c_files
  in
  let obj_files = List.map (fun src -> src ^ ".o") c_files in
  let db = db_link db "/mopsa.db" obj_files in
  let d = open_db ~create:true "/mopsa.db" in
  write_db d db;
  close_db d

let () =
  (* Separate Sys.argv into flags (starting with '-') and file arguments. *)
  let argv = Sys.argv in
  let prog = argv.(0) in
  let rest = Array.to_list (Array.sub argv 1 (Array.length argv - 1)) in

  let c_files, py_files, other_args =
    List.fold_right
      (fun arg (cs, pys, others) ->
        if is_c_file arg then (arg :: cs, pys, others)
        else if is_py_file arg then (cs, arg :: pys, others)
        else (cs, pys, arg :: others))
      rest ([], [], [])
  in

  let has_c = c_files <> [] in
  let has_py = py_files <> [] in

  if has_c && has_py then begin
    (* Cross-language: generate mopsa.db from C files, pass only the py entry point. *)
    (* The last .py in the list is the entry point (use-analysis puts it last). *)
    let entry_py = List.nth py_files (List.length py_files - 1) in
    generate_db c_files;
    let new_argv = Array.of_list (prog :: other_args @ [entry_py]) in
    let code =
      Fun.protect
        ~finally:(fun () -> (try Sys.remove "/mopsa.db" with _ -> ()))
        (fun () ->
           Mopsa_analyzer.Framework.Runner.parse_options
             new_argv
             Mopsa_analyzer.Framework.Runner.analyze_files
             ())
    in
    exit code
  end else begin
    (* Pure C or pure Python: pass everything as-is. *)
    exit @@
      Mopsa_analyzer.Framework.Runner.parse_options
        argv
        Mopsa_analyzer.Framework.Runner.analyze_files
        ()
  end

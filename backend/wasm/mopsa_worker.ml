(* External function implemented in JavaScript (core.ts) *)
external mopsa_emit : string -> unit = "mopsa_emit"

(* Command types for communication with JavaScript *)
type command =
  | Init of string          (* Initialize with configuration *)
  | Analyze of string       (* Analyze code *)
  | AnalyzeWithOptions of string * string list  (* Analyze with extra options *)
  | SetConfig of string     (* Set configuration JSON *)
  | SetCode of string       (* Set code to analyze *)
  | Stop                    (* Stop the worker *)

(* Response type *)
type response = {
  success : bool;
  message : string;
  data : string option;
}

(* Serialize response to JSON *)
let serialize_response (resp : response) : string =
  let data_str = match resp.data with
    | Some d -> Printf.sprintf ", \"data\": %s" d
    | None -> ""
  in
  Printf.sprintf "{\"success\": %b, \"message\": \"%s\"%s}"
    resp.success
    (String.escaped resp.message)
    data_str

(* Global state *)
let current_code = ref ""
let current_config = ref ""
let mopsa_output = ref ""

(* Enable backtrace recording *)
let () = Printexc.record_backtrace true

(* Default configuration for Universal language - works in WASM without Clang *)
let default_config =
  "{\"language\": \"universal\",\"domain\": {\"switch\": [\"universal.iterators.program\",\"universal.iterators.intraproc\",\"universal.iterators.loops\",\"universal.iterators.interproc.inlining\",\"universal.iterators.unittest\",{\"nonrel\": {\"union\": [\"universal.numeric.values.intervals.float\",\"universal.strings.powerset\"]}},\"universal.numeric.collecting\"]}}"

(* File paths in virtual filesystem *)
let code_file = "/code.u"
let config_file = "/config.json"
let share_dir = "/share"

(* Write file to virtual filesystem *)
let write_file path content =
  let oc = open_out path in
  output_string oc content;
  close_out oc

(* Capture stdout output *)
let capture_stdout () =
  mopsa_output := ""

let append_stdout s =
  mopsa_output := !mopsa_output ^ s

(* Initialize MOPSA *)
let init_mopsa config =
  try
    Printf.printf "init_mopsa called with config: '%s'\n" config;
    Printf.printf "default_config: '%s'\n" default_config;
    current_config := (if config = "" then default_config else config);
    Printf.printf "Writing config to %s\n" config_file;
    Printf.printf "Config: %s\n" !current_config;
    write_file config_file !current_config;
    Printf.printf "Config file written successfully\n";
    { success = true; message = "MOPSA initialized"; data = None }
  with e ->
    { success = false; message = Printexc.to_string e; data = None }

(* Run MOPSA analysis with given options *)
let run_mopsa_analysis options =
  Printf.printf "run_mopsa_analysis called\n";
  flush stdout;

  Printf.printf "Capturing stdout\n";
  flush stdout;
  capture_stdout ();

  Printf.printf "Setting config option\n";
  flush stdout;
  (* Set the config file path that analyze_files will read *)
  Mopsa_analyzer.Framework.Params.Config.Parser.opt_config := config_file;

  Printf.printf "Calling analyze_files directly\n";
  flush stdout;

  (* Call analyze_files directly instead of going through parse_options *)
  let exit_code =
    try
      Printf.printf "About to call analyze_files with file: %s\n" code_file;
      flush stdout;

      (* Try to catch the exact point of failure *)
      Printf.printf "Calling analyze_files...\n";
      flush stdout;

      let result = Mopsa_analyzer.Framework.Runner.analyze_files [code_file] None in

      Printf.printf "analyze_files completed with result: %d\n" result;
      flush stdout;
      result
    with
    | Sys_error msg ->
        Printf.printf "Sys_error during analysis: %s\n" msg;
        Printf.printf "Backtrace: %s\n" (Printexc.get_backtrace ());
        flush stdout;
        1
    | e ->
        Printf.printf "Exception during analysis: %s\n" (Printexc.to_string e);
        Printf.printf "Backtrace: %s\n" (Printexc.get_backtrace ());
        flush stdout;
        1
  in
  Printf.printf "analyze_files returned: %d\n" exit_code;
  flush stdout;
  (exit_code, !mopsa_output)

(* Analyze code *)
let analyze_code ?(options=[]) code =
  Printf.printf "analyze_code called with code length: %d\n" (String.length code);
  flush stdout;
  try
    Printf.printf "Setting current_code\n";
    flush stdout;
    current_code := code;

    Printf.printf "Writing code to file\n";
    flush stdout;
    write_file code_file code;

    Printf.printf "Code written to %s\n" code_file;
    Printf.printf "Config file: %s\n" config_file;
    flush stdout;

    (* Try to read back the config to verify it's there *)
    Printf.printf "Reading config file\n";
    flush stdout;
    let ic = open_in config_file in
    let config_content = really_input_string ic (in_channel_length ic) in
    close_in ic;
    Printf.printf "Config content (first 100 chars): %s\n" (String.sub config_content 0 (min 100 (String.length config_content)));
    flush stdout;

    (* Run actual MOPSA analysis *)
    Printf.printf "Running MOPSA analysis\n";
    flush stdout;
    let (exit_code, output) = run_mopsa_analysis options in

    let escaped_output = String.escaped output in
    if exit_code = 0 then
      { success = true;
        message = "Analysis complete";
        data = Some (Printf.sprintf "\"%s\"" escaped_output) }
    else
      { success = false;
        message = Printf.sprintf "Analysis failed with exit code %d" exit_code;
        data = Some (Printf.sprintf "\"%s\"" escaped_output) }
  with e ->
    Printf.printf "Exception in analyze_code: %s\n" (Printexc.to_string e);
    Printf.printf "Backtrace: %s\n" (Printexc.get_backtrace ());
    flush stdout;
    { success = false;
      message = Printexc.to_string e;
      data = Some (Printf.sprintf "\"%s\"" (String.escaped !mopsa_output)) }

(* Parse command from JSON string *)
let parse_command json_str : command option =
  try
    (* Simple JSON parsing - look for command patterns *)
    if String.length json_str < 2 then None
    else
      let s = String.trim json_str in
      (* Handle array format: ["CommandName", "arg"] or ["CommandName"] *)
      if String.get s 0 = '[' then
        let s_len = String.length s in
        if s_len < 2 then None
        else
          let s = String.sub s 1 (s_len - 2) in
          let parts = String.split_on_char ',' s in
          match parts with
          | [cmd] ->
              let cmd = String.trim cmd in
              let cmd_len = String.length cmd in
              if cmd_len < 2 then None
              else
                let cmd = String.sub cmd 1 (cmd_len - 2) in (* remove quotes *)
                (match cmd with
                 | "Stop" -> Some Stop
                 | _ -> None)
          | cmd :: arg :: _ ->
              let cmd = String.trim cmd in
              let cmd_len = String.length cmd in
              if cmd_len < 2 then None
              else
                let cmd = String.sub cmd 1 (cmd_len - 2) in
                let arg = String.trim arg in
                let arg = if String.length arg >= 2 && String.get arg 0 = '"' && String.get arg (String.length arg - 1) = '"'
                          then
                            let arg_len = String.length arg in
                            String.sub arg 1 (arg_len - 2)
                          else arg in
                (match cmd with
                 | "Init" -> Some (Init arg)
                 | "Analyze" -> Some (Analyze arg)
                 | "SetConfig" -> Some (SetConfig arg)
                 | "SetCode" -> Some (SetCode arg)
                 | _ -> None)
          | _ -> None
      else
        None
  with
  | Invalid_argument _ -> None
  | _ -> None

(* Handle a request from JavaScript *)
let handle_request json_str =
  try
    Printf.printf "handle_request called with: %s\n" json_str;
    flush stdout;
    match parse_command json_str with
    | Some (Init config) ->
        Printf.printf "Handling Init command\n";
        flush stdout;
        serialize_response (init_mopsa config)
    | Some (Analyze code) ->
        Printf.printf "Handling Analyze command\n";
        flush stdout;
        serialize_response (analyze_code code)
    | Some (AnalyzeWithOptions (code, options)) ->
        Printf.printf "Handling AnalyzeWithOptions command\n";
        flush stdout;
        serialize_response (analyze_code ~options code)
    | Some (SetConfig config) ->
        Printf.printf "Handling SetConfig command\n";
        flush stdout;
        current_config := config;
        write_file config_file config;
        serialize_response { success = true; message = "Config set"; data = None }
    | Some (SetCode code) ->
        Printf.printf "Handling SetCode command\n";
        flush stdout;
        current_code := code;
        write_file code_file code;
        serialize_response { success = true; message = "Code set"; data = None }
    | Some Stop ->
        Printf.printf "Handling Stop command\n";
        flush stdout;
        serialize_response { success = true; message = "Stopped"; data = None }
    | None ->
        Printf.printf "Unknown command\n";
        flush stdout;
        serialize_response { success = false; message = "Unknown command: " ^ json_str; data = None }
  with e ->
    Printf.printf "Exception in handle_request: %s\n" (Printexc.to_string e);
    Printf.printf "Backtrace: %s\n" (Printexc.get_backtrace ());
    flush stdout;
    serialize_response { success = false; message = "Error: " ^ Printexc.to_string e; data = None }

(* Main entry point *)
let () =
  (* Register the callback that JavaScript will call *)
  Callback.register "mopsa_post" handle_request;

  (* Handle stdin for worker mode, otherwise run mopsa directly *)
  if Array.length Sys.argv > 1 && Sys.argv.(1) = "-stdin" then
    try
      while true do
        mopsa_emit @@ handle_request @@ Stdlib.read_line ()
      done
    with End_of_file -> ()
  else
    (* Run mopsa directly, parsing command-line arguments *)
    Mopsa_analyzer.Framework.Runner.run ()


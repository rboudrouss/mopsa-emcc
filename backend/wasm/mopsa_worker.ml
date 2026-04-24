let () = Printexc.record_backtrace true

let () =
    Mopsa_analyzer.Framework.Runner.run ()

export default function MopsaOutput({ output }: { output: string }) {

  return (
    <div className="mopsa-output" style={{ height: "100%", overflowY: "auto" }}>
      <pre style={{
        padding: "2rem",
      }}>{output}</pre>
    </div>
  );
}

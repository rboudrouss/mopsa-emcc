export default function MopsaOutput({ output }: { output: string }) {

  return (
    <div className="mopsa-output">
      <pre style={{
        padding: "2rem",
      }}>{output}</pre>
    </div>
  );
}

(function(){
/* Login screen — split layout: brand panel + sign-in form. */
const { Field, Input, Button, Checkbox } = window.CSDS;

function LoginScreen({ onSignIn }) {
  const [email, setEmail] = React.useState("grace.manalo@cloudstaff.com");
  const [pw, setPw] = React.useState("••••••••••");
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div className="bg-gradient-brand" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "var(--space-5xl)" }}>
        <window.Logo reversed width={170} />
        <div className="stack-md" style={{ maxWidth: "30rem" }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Your global team, in one workspace.</h2>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "var(--font-size-lg)" }}>
            Timesheets, leave, documents and payroll for your dedicated offshore staff — managed end to end.
          </p>
        </div>
        <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.7)", margin: 0 }}>#1 Workplace · Manila · Cebu · Davao</p>
      </div>

      <div style={{ display: "grid", placeItems: "center", padding: "var(--space-2xl)" }}>
        <form
          className="stack-xl"
          style={{ width: "min(24rem, 100%)" }}
          onSubmit={(e) => { e.preventDefault(); onSignIn(); }}
        >
          <div className="stack-xs">
            <h3 style={{ margin: 0 }}>Sign in</h3>
            <p className="text-secondary" style={{ margin: 0 }}>Welcome back. Use your Cloudstaff account.</p>
          </div>
          <Field label="Work email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="pw">
            <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <div className="cluster justify-between">
            <Checkbox label="Keep me signed in" defaultChecked />
            <a href="#" className="text-brand text-sm weight-semibold" onClick={(e) => e.preventDefault()}>Forgot password?</a>
          </div>
          <Button variant="primary" block type="submit">Sign in</Button>
          <p className="text-muted text-sm text-center" style={{ margin: 0 }}>
            Need an account? <a href="#" className="text-brand weight-semibold" onClick={(e) => e.preventDefault()}>Contact your manager</a>
          </p>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen });

})();

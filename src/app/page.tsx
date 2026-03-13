export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.12),transparent_40%),linear-gradient(180deg,#0a0a0f_0%,#12121a_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-24">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70">
            Fal-Powered AI Studio
          </div>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Vyde Labs
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
            A clean AI workspace for text, image, and video generation, built
            around folders, history, and a consistent creation flow.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="text-sm font-medium text-white">One workspace</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Text, image, and video live in one shared studio instead of being
              split across separate tools.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="text-sm font-medium text-white">Folders first</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Save outputs, group variations, and keep your creative workspace
              organized from the start.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="text-sm font-medium text-white">Local or hosted</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Run it yourself with your own Fal key or use the managed hosted
              version with credit-based billing.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

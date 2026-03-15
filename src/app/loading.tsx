function LoadingBlock({
  className,
}: {
  className: string;
}) {
  return <div className={`animate-pulse rounded-[24px] bg-white/8 ${className}`} />;
}

export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col bg-[linear-gradient(180deg,#07111c_0%,#091523_38%,#0b1626_100%)] text-white">
      <div className="flex h-[54px] items-center border-b border-white/8 px-4 md:px-6">
        <LoadingBlock className="h-7 w-44 rounded-full" />
        <div className="ml-auto flex items-center gap-3">
          <LoadingBlock className="h-8 w-28 rounded-full" />
          <LoadingBlock className="h-8 w-8 rounded-full" />
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden px-4 py-4 md:px-6">
        <div className="hidden w-[248px] shrink-0 xl:flex xl:flex-col xl:gap-3">
          <LoadingBlock className="h-12 w-full" />
          <LoadingBlock className="h-12 w-full" />
          <LoadingBlock className="h-12 w-full" />
          <LoadingBlock className="h-12 w-full" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <LoadingBlock className="aspect-[1.15] w-full" />
            <LoadingBlock className="aspect-[1.15] w-full" />
            <LoadingBlock className="aspect-[1.15] w-full" />
            <LoadingBlock className="aspect-[1.15] w-full" />
            <LoadingBlock className="aspect-[1.15] w-full" />
            <LoadingBlock className="aspect-[1.15] w-full" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none sticky bottom-0 px-4 pb-4 md:px-6">
        <LoadingBlock className="mx-auto h-[78px] max-w-[1180px] rounded-[30px]" />
      </div>
    </main>
  );
}

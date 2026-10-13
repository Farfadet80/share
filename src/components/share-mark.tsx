export function ShareMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" fill="#111111" />
      <rect x="132" y="212" width="248" height="176" rx="28" fill="none" stroke="#f2f2f7" strokeWidth="32" />
      <path d="M256 246 V140" fill="none" stroke="#0a84ff" strokeWidth="32" strokeLinecap="round" />
      <path d="M200 188 L256 128 L312 188" fill="none" stroke="#0a84ff" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

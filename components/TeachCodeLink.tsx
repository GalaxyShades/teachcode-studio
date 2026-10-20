import { teachcodeLearnHref } from "@/lib/teachcode-public";

/** Leaves Studio and opens the TeachCode course list. */
export function TeachCodeLink() {
  const href = teachcodeLearnHref();
  if (!href) return null;
  return (
    <a className="btn-secondary" href={href}>
      Back to TeachCode
    </a>
  );
}

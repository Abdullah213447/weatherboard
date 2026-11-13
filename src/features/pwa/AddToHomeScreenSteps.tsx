/** How to install on an iPhone or iPad, where there is no install button to offer. */
export function AddToHomeScreenSteps() {
  return (
    <ol className="text-muted list-decimal space-y-1 pl-5 text-sm">
      <li>
        Tap <span className="text-ink font-medium">Share</span> in Safari&rsquo;s toolbar.
      </li>
      <li>
        Choose <span className="text-ink font-medium">Add to Home Screen</span>.
      </li>
      <li>
        Tap <span className="text-ink font-medium">Add</span>.
      </li>
    </ol>
  );
}

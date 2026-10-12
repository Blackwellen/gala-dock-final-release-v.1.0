/** Where calendar OAuth may send the user back to: same-site account/organizer/provider pages only (no open redirect). */
export function safeReturn(v: string | null | undefined) {
  return v && /^\/(organizer|account|provider)(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_-]*)?$/.test(v) ? v : "/account?tab=profile";
}

# Audit: Japanese booster box group order web app

Scope: Code.gs, Index.html, appsscript.json, SETUP.md, checked against the brief.
Method: full code read, plus a local test harness with mocked Apps Script services (normal order, empty sheet, negative, decimal, string and huge quantities, duplicate lines, hidden product, formula injection, honeypot, speed check, rate limit, null form). Spreadsheet checks were limited to what the Drive connector shows (see "Not verified").

## Findings, ranked by severity

### High
1. **Abuse of the anonymous endpoint.** Anyone could call `submitOrder` unlimited times, with any number of lines. Fixed: honeypot field, minimum 3 seconds on page, 5 orders per contact per hour and 100 per hour overall (CacheService, checked inside the lock), cap of 13 lines per order, duplicate product lines merged so the per line maximum cannot be dodged.
2. **Raw server errors reached the buyer.** Any unexpected exception message was shown in the UI. Fixed: `submitOrder` now returns `{ok:false, error}` with French messages only, and logs the real error server side.
3. **Page loads wrote to the spreadsheet.** `getAppData` created the "Commandes WebApp" tab on the first visit, so an anonymous GET could modify the sheet. Fixed: the tab is only created by the first order.
4. **Formula injection relied on one apostrophe prefix.** Fixed: Nom, Contact and Note columns are formatted as plain text before writing, control and zero width characters are stripped, and the apostrophe prefix is kept as a second layer.

### Medium
5. **Whole tab read on every page load.** Added a 30 second CacheService cache of the tally. The order path always recounts from the sheet inside the lock and refreshes the cache, so the figure returned after an order is exact. Other visitors may see a figure up to 30 seconds old, and also after the organiser edits the tab by hand.
6. **Time zone was Europe/London.** Buyers are Swiss, so changed to Europe/Zurich. Date cells now have an explicit `yyyy-mm-dd hh:mm` format and are stored as real dates; quantities and prices are stored as numbers.
7. **Weak contact validation** (any 5 characters). Now requires a plausible e-mail or an 8 to 15 digit phone number.
8. **OAuth scope** `script.container.ui` was not needed. Removed. Only `spreadsheets` remains (needed for `openById`).
9. **Accessibility and mobile.** Tap targets raised from 36 to 44px; focus trap, Escape to close and focus return for the order sheet; scroll lock behind the sheet; visible focus rings; `aria-live` moved onto the status text; progressbar now carries `aria-valuenow`; WhatsApp footnote is a real link instead of a clickable paragraph; safe area insets on both sides; `dvh` sheet height; honeypot hidden from screen readers.
10. **Missing states.** Added retry button on load failure, a "no active products" message, double submission guard, network failure message that asks to contact you before reordering (the order may or may not have been saved), and the checkbox and timer reset after success.
11. **Dark mode** added (prefers-color-scheme, about 15 lines of CSS tokens). Reduced motion respected.
12. **Copy.** Added the indicative price disclaimer from the original sheet, a short privacy line on the order sheet, a "next step" paragraph on the confirmation screen, and plural fix for "commandée(s)". The decorative minus sign is now a plain hyphen; there are no em or en dashes anywhere.

### Low
13. A product made inactive after orders exist keeps counting in the tracker (intended) but its rows stay valid. No change needed.
14. The returned reference uses 6 hex characters (16 million values). Collision risk is negligible at this scale, no uniqueness check added.
15. The tracker also counts rows an organiser edits by hand (column J "Boîtes suivies"). Negative or decimal hand edits are clamped to a whole number of at least 0.

## Spreadsheet fidelity: what I could and could not verify
- Working copy sharing: only philippe.luyet@gmail.com, owner. Not shared with anyone else. Good: the sheet is not exposed to buyers.
- **Column B "Prix/unité" in the working copy shows `#REF!` for all 8 priced rows.** This means those cells hold formulas that point to another file the copy cannot reach (very likely an IMPORTRANGE or lookup into a price sheet). I did not open, trace or touch it. Consequence: the working copy cannot be used to check the 8 confirmed prices, and I did not. The prices in `PRODUCTS` are those from your brief, unverified against the sheet.
- Product names and order in `PRODUCTS` match column A and column Z of the working copy (13 products, same spelling). The code has "30th Anniversary" with capitals where the sheet has "30th anniversary", cosmetic only.
- The connector returns a text summary, so I could not compare formulas, merged ranges, number formats or data validation with the original, and I did not open the original. This check is still open and needs a Sheets API or Apps Script run under your account.
- The original grid (buyers in columns, quantities per product row, totals) is not touched. The new tab "Commandes WebApp" is separate and one row per product per order.

## Left alone, and why
- **Back office bridge.** Suggested, not built: a "Synthèse" tab with `QUERY`/`SUMIFS` on "Commandes WebApp" by buyer reference and by product. It does not alter existing formulas. Say yes and I will add it.
- **Customer order lookup or amendment.** Not built. Simplest option: buyers message the organiser with their reference.
- **Bank details on the confirmation page.** Not shown. `PAYMENT_NOTE` says details are sent after confirmation, which is an assumption about your process: please confirm.
- **Rate limit by IP.** Apps Script does not expose the visitor IP to anonymous web apps, so limits are per contact and global.
- **Google sign in.** Not added. Extension point: `placeOrder_` receives everything as one `form` object, so a verified e-mail from `Session.getActiveUser()` (Workspace) or an ID token could later replace the typed contact.

## Suggested extras (not built)
Order confirmation e-mail via `MailApp` (needs one more scope); a read-only "Mon suivi" lookup by reference; a per-product breakdown (already behind `SHOW_PRODUCT_BREAKDOWN`); `LockService` plus a daily trigger that archives test or cancelled rows; protecting the Orders tab so only you edit it.

## Security checklist
- No seller side data in any response: `getAppData` and `submitOrder` return only products, public prices, totals, the buyer's own reference.
- No other buyers' names, contacts or notes are ever read back to the client.
- Prices and totals are computed server side from `PRODUCTS` only.
- The supplier price sheet ID appears nowhere in these files. I did not open that sheet.
- HTML: all server and user text goes through `textContent`. The only `innerHTML` assignments are `= ''` to clear containers.
- No secrets in any file.

## Not tested
Live deployment, concurrency on the real lock, phone width and logged out behaviour: see DEPLOY.md, I could not authenticate to Google Apps Script.

## Questions for you
1. Prices for the 5 hidden products (Nihil Zero M3, Nihil Zero no shrink M3, Mega Dream M2a, Mega Dream no shrink M2a, Inferno X M2)?
2. WhatsApp group invite link?
3. Show bank details after ordering, or keep the generic note?
4. Keep accepting orders after 20 boxes (current), or close the page?
5. Should all 13 products count toward the 20 (current)?
6. Why does column B of the working copy show `#REF!`, and where should the 8 prices be confirmed from?
7. Is a 20 boxes per product line maximum acceptable? You asked for no maximum per customer; the cap is per product per order and only an anti abuse limit. Raise `MAX_QTY_PER_LINE` if you want.

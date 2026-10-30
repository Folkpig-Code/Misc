# Pilot: Japanese booster box group order web app

## What's in this folder

| File | Purpose |
|---|---|
| `Code.gs` | Server logic: product list, booster box tracker, order saving |
| `Index.html` | Buyer-facing page (French, mobile first) |
| `appsscript.json` | Apps Script manifest (timezone, web app access) |

## What buyers can and cannot see

- Buyers only see the web app page: products, prices, the total progress toward 20 boxes, and their own order reference.
- Buyers never get access to any spreadsheet. The order grid, the supplier price sheet, and the Orders tab are all private.
- The supplier price sheet is never referenced by the code.
- Optional: set `SHOW_PRODUCT_BREAKDOWN: true` in `Code.gs` to show per-product counts. Off by default.

## Setup (about 10 minutes)

1. Open the working copy sheet, "Commandes groupées Pokemon Japonais - WebApp working copy".
2. Go to **Extensions > Apps Script**.
3. Delete the default `Code.gs` content and paste in the contents of this folder's `Code.gs`.
4. Click **+ > HTML** and name it `Index` (it will become `Index.html`). Paste in the contents of `Index.html`.
5. Open **Project Settings** (gear icon), tick **Show "appsscript.json" manifest file in editor**, then paste in the contents of `appsscript.json`.
6. In `Code.gs`, set `WHATSAPP_URL` to your WhatsApp group invite link once it exists.
7. Click **Deploy > New deployment**, choose **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Authorise the app when prompted, then copy the web app URL. That is the only link you share with buyers.

After this the sheet gets a new tab, "Commandes WebApp", created on the first order. That is the one place to read orders. Keep buyers as viewers of the sheet, or do not share the sheet at all.

## Updating the app after changes

Edit the files in Apps Script, then **Deploy > Manage deployments > edit (pencil) > New version > Deploy**. The URL stays the same.

## Things to fill in or decide

- [ ] **Prices for 5 products** (Nihil Zero M3, Nihil Zero no shrink M3, Mega Dream M2a, Mega Dream no shrink M2a, Inferno X M2). They are hidden until a price is set. Set `price` and `active: true` in `PRODUCTS`.
- [ ] **WhatsApp group link** for `WHATSAPP_URL`.
- [ ] **Bank transfer details**: currently only a generic note. Decide whether the page should show them.
- [ ] **After 20 boxes**: should orders keep coming in for the next batch (current behaviour), or should the page close?
- [ ] **Which products count** toward the 20: currently all 13 are marked `tracked: true`.
- [ ] **Google sign-in** later, if wanted. Currently anyone with the link can order.

## Notes

- Orders are saved as one row per product, grouped by reference (`PKM-XXXXXX`).
- Each row has a "Boîtes suivies" column that counts toward the tracker. The total is recalculated on each page load.
- Input is cleaned, and formula-like text is neutralised so nobody can inject formulas into the sheet.
- Orders are processed under a lock, so two buyers ordering at once cannot overwrite each other.

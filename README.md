# Lucas MEA staff site (lucasmeacatalogue.com/admin)

The public Lucas MEA online catalogues were taken offline on 5 Nov 2026: the catalogue pages, cart and contact form
were removed from the site, and the hourly "publish from database" workflow was deleted. Opening lucasmeacatalogue.com
now shows the hosting's "page not found". Search engines are told to drop the site (robots.txt: Disallow /).

Still served:
- `/admin/` – the Lucas staff site (inquiries, number lookup, parts & prices, part numbers, barcodes, inventory).
  Data lives in the Supabase "Master Data" project and is unchanged.
- `/rfq/` – opens the inquiry links in earlier inquiry emails (download the Excel); not linked from anywhere.
- `/assets/` – only the files the two pages above use.
- `setup/` – scripts and edge function sources kept for reference.

Everything removed is still in the git history (the commit before "Take the public catalogue offline").

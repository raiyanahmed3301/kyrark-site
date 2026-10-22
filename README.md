# Kyrark website

This is a static website with a contact endpoint for Vercel and Cloudflare Pages. Deploy the project root with Vercel or connect the repository to Cloudflare Pages. No build command or output directory is required. `vercel.json` configures Vercel's clean URLs and security response headers. `_headers` configures equivalent response headers on Cloudflare Pages.

## Contact form

The engagement form posts to `/api/contact`, which sends the enquiry through Resend to `cursedblademaster@protonmail.com`. Configure these server-side environment variables in your host (Production and Preview as needed):

- `RESEND_API_KEY`: a Resend sending API key. Keep it private; never use a `NEXT_PUBLIC_` variable.
- `EMAIL_FROM`: a sender address on a domain verified in Resend, for example `Kyrark <enquiries@your-verified-domain.example>`.

On Vercel, add the variables in Project Settings → Environment Variables. On Cloudflare Pages, add them in Settings → Variables and Secrets. Resend requires a verified sending domain for delivery to arbitrary recipients. Set DNS records shown in Resend, verify the domain, then set the two environment variables and redeploy. Submissions use the visitor's validated address as `Reply-To`. The function also validates origin and fields, ignores a honeypot, and applies a small in-memory burst limit; use your host's rate limiting for durable abuse protection.

## Local preview

Serve the project directory with Vercel CLI (`vercel dev`) to exercise `/api/contact`, or use the Cloudflare Pages local development workflow (`wrangler pages dev`). A basic static server such as `python3 -m http.server 8000` can preview pages but cannot run the API function.

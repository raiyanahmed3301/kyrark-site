# Kyrark website

This is a static website with one Vercel serverless function. Deploy the project root with Vercel; no build command or output directory is required. `vercel.json` configures clean URLs and security response headers. The `_headers` file provides equivalent headers for hosts that support the Cloudflare Pages headers format.

## Contact form

The contact form posts to `/api/contact`, which sends the enquiry through Resend to `cursedblademaster@protonmail.com`. Configure these server-side environment variables in Vercel (Production and Preview as needed):

- `RESEND_API_KEY`: a Resend sending API key. Keep it private; never use a `NEXT_PUBLIC_` variable.
- `EMAIL_FROM`: a sender address on a domain verified in Resend, for example `Kyrark <enquiries@your-verified-domain.example>`.

Resend requires a verified sending domain for delivery to arbitrary recipients. Set DNS records shown in Resend, verify the domain, then set the two environment variables and redeploy. Submissions use the visitor's validated address as `Reply-To`. The function also validates origin and fields, ignores a honeypot, and applies a small in-memory burst limit; use Vercel Firewall rate limiting for durable abuse protection.

## Local preview

Serve the project directory with Vercel CLI (`vercel dev`) to exercise `/api/contact`, then open the local URL it prints. A basic static server such as `python3 -m http.server 8000` can preview pages but cannot run the API function.

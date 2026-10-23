# Kyrark

**Offensive security and cyber resilience.**

Kyrark helps organisations understand how their systems, people and processes may be exposed to real-world attacks. We conduct scoped security assessments, validate attack paths through controlled testing, and turn evidence into clear, prioritised guidance that teams can use to reduce risk.

## What we do

- **Red team operations:** threat-informed adversary emulation to assess detection and response across agreed people, processes and technology.
- **Web application and API penetration testing:** manual security testing focused on access control, authentication, business logic and other application risks. Coverage can be mapped to the OWASP Top 10:2025 and tailored to the agreed scope.
- **Threat intelligence:** research and intelligence capabilities designed to prioritise external exposure, relevant adversaries and vulnerabilities. The Kyrark intelligence platform is under development and available through early access.

## How we work

Engagements begin with written objectives, scope and rules of engagement. Testing is controlled and evidence-led. Deliverables are designed for both technical teams and decision-makers, with prioritised findings, remediation guidance and retesting where included in the engagement.

All testing requires explicit authorisation and is limited to the systems and activities agreed in writing. OWASP and other frameworks guide assessment coverage; a mapping does not constitute certification or guarantee that every risk category applies to every engagement.

## Website and deployment

This repository contains Kyrark's static website and serverless contact form. The site can be deployed from the repository root on Vercel or Cloudflare Pages. Vercel uses `vercel.json` for clean URLs, function settings and security headers; Cloudflare Pages uses `_headers` for response headers. No build command or output directory is required.

### Contact form configuration

The engagement form posts to `/api/contact` and sends enquiries through Resend to `cursedblademaster@protonmail.com`. Configure these server-side environment variables in the hosting provider for the environments where the form should work:

- `RESEND_API_KEY`: a Resend API key with permission to send mail. Keep it private; do not expose it in browser code or a `NEXT_PUBLIC_` variable.
- `EMAIL_FROM`: a sender address on a domain verified in Resend, for example `Kyrark <enquiries@your-verified-domain.example>`.

In Vercel, add the variables under **Project Settings → Environment Variables**. In Cloudflare Pages, add them under **Settings → Variables and Secrets**. Verify the sending domain with Resend, configure the DNS records Resend provides, then redeploy after setting the variables. The visitor's validated email address is used as `Reply-To`.

The endpoint validates request origin and fields, ignores a honeypot field, and applies an in-memory burst limit. Configure platform-level rate limiting for durable abuse protection across serverless instances.

### Local development

Use the Vercel CLI (`vercel dev`) or Cloudflare Pages local development workflow (`wrangler pages dev`) to run the site with its contact endpoint. A static server such as `python3 -m http.server 8000` can preview the pages but does not run the API function.

Run the contact endpoint test suite with:

```sh
npm test
```

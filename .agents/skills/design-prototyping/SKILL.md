---
name: design-prototyping
description: This skill describes how to create prototype pages to explore website designs and copy
---

# Design Brief

You are creating design prototypes for a marketing/landing page site.

## Step 1: Understand the Product

If this is a new repo:

- Read `docs/concept.md` in this repository. It describes the product or concept this site will market. Internalize the key value propositions, features, and positioning before proceeding.

If this is an existing website:

- Read the `src/index.astro` in this repository. The copy should be used as a source for the concept of the site.

## Step 2: Clarify the Purpose

Confirm with the user the following before proceeding:

1. **Who is the intended audience?** (e.g., developers, small business owners, general consumers, enterprise buyers)
2. **What is the primary call-to-action?** The most common case is email collection for gauging interest (lean startup MVP style), but confirm this with the user. Other options could include: Calendly style scheduler (Use ShadCN), Join our Discord, follow us on Bluesky/X
3. **Are there any brand constraints?** (e.g., specific colors, existing logo, tone of voice) If none, you have full creative freedom.
4. **What company owns the site?** Ask if the site should state one. By default the company that owns the site is Wyrd, at https://wyrd.company. Other options includes Dark Futures Interactive (https://darkfutures.com) and Scratching Monkey Software (https://scratchingmonkey.com). The user may ask to omit it.
5. **Whould the site have a login page, about page, privacy policy page, and/or terms of use page?**

## Step 3: Set Up the Project (skip if already setup)

1. Run `pnpm create astro@latest` in the project root. Choose the empty template, strict TypeScript, and accept defaults. Answer yes to installing dependencies. You will have to copy the contents of the subfolder created to the root. Do not overwrite README.md.
2. Update the astro config to bind the site to the host 0.0.0.0 since you are running in a devcontainer.
3. Install and configure Tailwind CSS for Astro.

## Step 4: Create Design Prototypes

Create the number of distinct prototypes specified by the user in their prompt (e.g., "create 3 prototypes").

### Routing

- Each prototype is a single page accessible at `/1`, `/2`, `/3`, etc.
- Create these as `src/pages/1/index.astro`, `src/pages/2/index.astro`, etc.

### Design Requirements

- **Each prototype must be a completely different design.** Vary layout structure, color palette, typography, visual style, and overall feel. One might be bold and dark, another minimal and airy, another playful and colorful. Exercise full creative freedom.
- Each prototype is a complete, single-page marketing/landing page.
- Write original copy for each prototype grounded in `concept.md` and tailored to the intended audience established in Step 2. Don't reuse the same copy across prototypes.
- Each prototype must include the agreed-upon call-to-action (e.g., an email signup form).
- Use Tailwind CSS for all styling. No external CSS frameworks.
- If the page has interactive elements, use React/ShadCN when needed.
- Pages should be responsive and look good on both mobile and desktop.

### Prototype Navigation

Include a navigation element on every prototype page that allows switching between prototypes (links to `/1`, `/2`, `/3`, etc.). Implement a common layout that adds the navigation to each prototype.

**Important:** This navigation is a utility element for reviewing the prototypes. It is **not** part of the prototype's design. It should be clearly separate and unobtrusive -- you decide the form (a floating bar, a small corner pill, a minimal strip, etc.) as long as it does not interfere with or appear to be part of the prototype design itself.

## Step 5: Verify

1. Run `pnpm dev` and confirm each prototype page loads without errors.
2. Verify that navigation between prototypes works.
3. Check that pages render correctly at different viewport widths.

## Step 6: Review

Review the prototypes created, even previous ones. Provide your opinion on which are your favorites and why. Also consider the copy of each one, what is the strongest copy and why?

## Step 7: Iterate and select

The user will likely want to iterate on the designs. This may involve creating new prototypes. Some entirely new, others variations of existing ones.

The user will eventually identify the one prototype that is the winner.

## Step 8: Finalize

Once the winner is selected:

1. Update the root page to the design of the winning prototype.
2. Remove the existing prototypes.
3. (If new or updated) Use the favicon skill to create a favicon for the site. Use `rsvg-convert` to convert the svg to png so it is not blurry.
4. (If new) Have the user set the GitHub repository secret: DREAMHOST_REMOTE `ssh://scratchingmonkey@<site name>/home/scratchingmonkey/<site name>.git`
5. If there is an email form, set it up to use the `sf_3ha45db65ai25lcglfme20fj` key and show a confirmation page, `signup-confirmed` or `waitlist-confirmed`, that has a button to go back to the home page.
6. Update the README.md
7. **Where will the site be hosted?** Ask if the site will be hosted on Dreamhost or Cloudflare. The `.github/workflows/cd.yml` has commented out steps for each. Uncomment the appropriate one and remove the unneeded commented step.

```html
<form action="https://api.staticforms.dev/submit" method="POST">
    <!-- Your API Key (replace with your actual key) -->
    <input type="hidden" name="apiKey" value="YOUR_API_KEY">
```
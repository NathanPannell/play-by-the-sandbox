// The two application forms, one config object each. This file is the single
// source of truth: the build renders the pages from it, the browser checks
// answers with it, api/apply.js validates on the server with it and the review
// page labels answers with it. To change a form, edit its `fields` list here.
//
// Every field has a `name` (the key it's stored under, so don't rename a field
// that already has submissions), a `label` and a `type`:
//
//   text, email, url   one line; `max` characters (default 200)
//   textarea           several lines; `max` characters (default 2000), `rows`
//   select             one of `options`
//   choices            any number of `options`, as checkboxes; `min` picks
//   links              add/remove rows of platform + link; `platforms`, `start`
//                      (the rows shown at first), `maxRows`, `min` links
//   photo              one optional image (see PHOTO below)
//   consent            a checkbox that must be ticked
//
// Optional keys: `required`, `hint` (small print under the label),
// `placeholder`, `autocomplete`, and `section` (starts a new numbered group).
// Answers are stored as JSON, so adding, removing or reordering fields needs
// no database migration.

/**
 * @typedef {'text' | 'email' | 'url' | 'textarea' | 'select' | 'choices' | 'links' | 'photo' | 'consent'} FieldType
 * @typedef {{
 *   name: string, label: string, type: FieldType, section?: string, required?: boolean,
 *   hint?: string, placeholder?: string, autocomplete?: string, max?: number, rows?: number,
 *   options?: string[], min?: number, platforms?: string[], start?: string[], maxRows?: number,
 * }} Field
 * @typedef {{
 *   kind: 'creator' | 'brand', path: string, title: string, heading: [string, string],
 *   intro: string, nameField: string, thanksField: string, emailField: string,
 *   other: { label: string, href: string }, fields: Field[],
 * }} Form
 */

export const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Website', 'Other'];

/** The photo limits. The browser shrinks big photos before sending, so uploads stay under MAX_UPLOAD. */
export const PHOTO = {
  /** Largest file someone can pick. */
  maxPick: 5 * 1024 * 1024,
  /** Largest file the server accepts (Vercel functions take request bodies up to 4.5 MB). */
  maxUpload: 4 * 1024 * 1024,
  /** Photos bigger than this are scaled down to `maxEdge` pixels before sending. */
  shrinkOver: 1.5 * 1024 * 1024,
  maxEdge: 1600,
  types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

export const STATUSES = ['new', 'shortlisted', 'declined'];

const CONSENT =
  'I’m happy for the Sandbox team to review this application and to contact me about Play by the Sandbox.';

/** @type {Record<'creator' | 'brand', Form>} */
export const FORMS = {
  creator: {
    kind: 'creator',
    path: '/apply/creator',
    title: 'Apply as an upcoming creator',
    heading: ['Apply as an', 'upcoming creator'],
    intro:
      'Photographers, filmmakers, performers, designers, makers of things: tell us who you are and show us your work. The Sandbox team reads every application.',
    nameField: 'name',
    thanksField: 'name',
    emailField: 'email',
    other: { label: 'Applying for a brand? Use the brand form', href: '/apply/brand' },
    fields: [
      {
        section: 'The basics',
        name: 'name',
        label: 'Your name',
        type: 'text',
        required: true,
        max: 120,
        autocomplete: 'name',
      },
      { name: 'email', label: 'Email', type: 'email', required: true, max: 254, autocomplete: 'email' },
      {
        name: 'location',
        label: 'Where are you based?',
        type: 'text',
        required: true,
        max: 120,
        placeholder: 'Vancouver, BC',
        autocomplete: 'address-level2',
      },
      {
        name: 'pronouns',
        label: 'Pronouns',
        type: 'text',
        max: 40,
        hint: 'Optional.',
        placeholder: 'she/her, they/them…',
      },
      {
        section: 'What you make',
        name: 'disciplines',
        label: 'Your creative discipline(s)',
        type: 'choices',
        required: true,
        min: 1,
        hint: 'Pick as many as fit.',
        options: [
          'Photography',
          'Videography & film',
          'Content creation',
          'Acting & on-camera',
          'Modelling',
          'Music & sound',
          'Dance & movement',
          'Illustration & design',
          'Styling & fashion',
          'Writing',
          'Something else',
        ],
      },
      {
        section: 'Where we can see your work',
        name: 'socials',
        label: 'Your socials',
        type: 'links',
        required: true,
        min: 1,
        hint: 'At least one. A link or an @handle both work.',
        platforms: PLATFORMS,
        start: ['Instagram', 'TikTok'],
        maxRows: 8,
      },
      {
        name: 'portfolio',
        label: 'Portfolio link',
        type: 'url',
        max: 500,
        hint: 'Optional. A website, reel, Drive folder or anything we can open.',
        placeholder: 'https://',
      },
      {
        name: 'photo',
        label: 'A photo or headshot',
        type: 'photo',
        hint: 'Optional. JPG, PNG, WebP or GIF, up to 5 MB.',
      },
      {
        section: 'Your story',
        name: 'about',
        label: 'Tell us about you',
        type: 'textarea',
        required: true,
        max: 2000,
        rows: 6,
        hint: 'What you make, how you got here, what you’re proud of.',
      },
      {
        name: 'pitch',
        label: 'What would you want to make with Sandbox?',
        type: 'textarea',
        required: true,
        max: 2000,
        rows: 5,
        hint: 'Dream big. A campaign, a character, a moment on the runway.',
      },
      {
        name: 'extra',
        label: 'Anything else we should know?',
        type: 'textarea',
        max: 1000,
        rows: 3,
        hint: 'Optional.',
      },
      { name: 'consent', label: CONSENT, type: 'consent', required: true },
    ],
  },
  brand: {
    kind: 'brand',
    path: '/apply/brand',
    title: 'Apply as an upcoming brand',
    heading: ['Apply as an', 'upcoming brand'],
    intro:
      'New and growing brands: tell us what you’re building and what you’d love to make. Sandbox pairs brands with creative directors and creators for real short-form campaigns.',
    nameField: 'brand',
    thanksField: 'contactName',
    emailField: 'email',
    other: { label: 'Applying as a creator? Use the creator form', href: '/apply/creator' },
    fields: [
      {
        section: 'The brand',
        name: 'brand',
        label: 'Brand name',
        type: 'text',
        required: true,
        max: 120,
        autocomplete: 'organization',
      },
      { name: 'website', label: 'Website', type: 'url', max: 500, hint: 'Optional.', placeholder: 'https://' },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: [
          'Fashion & apparel',
          'Beauty & wellness',
          'Food & drink',
          'Tech & apps',
          'Arts & culture',
          'Home & lifestyle',
          'Sports & outdoors',
          'Something else',
        ],
      },
      {
        name: 'stage',
        label: 'Stage',
        type: 'select',
        required: true,
        options: [
          'Idea or pre-launch',
          'Just launched (under a year)',
          'Growing (1 to 3 years)',
          'Established (3+ years)',
        ],
      },
      {
        name: 'location',
        label: 'Where is the brand based?',
        type: 'text',
        max: 120,
        placeholder: 'Vancouver, BC',
        hint: 'Optional.',
      },
      {
        section: 'Who we’re talking to',
        name: 'contactName',
        label: 'Your name',
        type: 'text',
        required: true,
        max: 120,
        autocomplete: 'name',
      },
      {
        name: 'role',
        label: 'Your role',
        type: 'text',
        max: 120,
        hint: 'Optional.',
        placeholder: 'Founder, marketing lead…',
      },
      { name: 'email', label: 'Email', type: 'email', required: true, max: 254, autocomplete: 'email' },
      {
        section: 'Where we can find you',
        name: 'socials',
        label: 'The brand’s socials',
        type: 'links',
        hint: 'Optional. A link or an @handle both work.',
        platforms: PLATFORMS,
        start: ['Instagram', 'TikTok'],
        maxRows: 8,
      },
      { name: 'photo', label: 'A logo or photo', type: 'photo', hint: 'Optional. JPG, PNG, WebP or GIF, up to 5 MB.' },
      {
        section: 'Your story',
        name: 'about',
        label: 'About the brand',
        type: 'textarea',
        required: true,
        max: 2000,
        rows: 6,
        hint: 'What you make, who it’s for, what makes it yours.',
      },
      {
        name: 'lookingFor',
        label: 'What are you looking for from Sandbox?',
        type: 'textarea',
        required: true,
        max: 2000,
        rows: 5,
        hint: 'A campaign, content, reach, a launch moment, new collaborators…',
      },
      {
        name: 'extra',
        label: 'Anything else we should know?',
        type: 'textarea',
        max: 1000,
        rows: 3,
        hint: 'Optional.',
      },
      { name: 'consent', label: CONSENT, type: 'consent', required: true },
    ],
  },
};

/** @param {unknown} kind @returns {Form | undefined} */
export function formFor(kind) {
  return kind === 'creator' || kind === 'brand' ? FORMS[kind] : undefined;
}

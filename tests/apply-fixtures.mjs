// Shared test data for the apply forms.

/** A complete, valid set of answers for each form. */
export const GOOD = {
  creator: {
    name: '  Robin   Test ',
    email: 'robin@example.com',
    location: 'Vancouver, BC',
    pronouns: '',
    disciplines: ['Photography', 'Writing', 'Writing', 'Not an option'],
    socials: [
      { platform: 'Instagram', url: '@robin.makes' },
      { platform: 'TikTok', url: '' },
    ],
    portfolio: 'robin.example.com/work',
    about: 'I make things.\r\nLots of things.',
    pitch: 'A crayon campaign.',
    consent: true,
    unknownField: 'dropped',
  },
  brand: {
    brand: 'Crayon Co.',
    website: 'https://crayon.example.com',
    category: 'Arts & culture',
    stage: 'Idea or pre-launch',
    contactName: 'Sam Lee',
    email: 'sam@crayon.example.com',
    about: 'We make crayons.',
    lookingFor: 'A launch moment.',
    consent: true,
  },
};

/** The smallest valid PNG: one transparent pixel. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
  'base64',
);

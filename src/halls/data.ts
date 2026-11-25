/* The building, floor by floor (ground + 7). Edit names, capacities and details here.
   `band` is where the floor sits in public/halls/front.webp, as fractions of the image height;
   `bandM` is the same for the portrait phone image public/halls/front-mobile.webp. */

export interface Setup { label: string; capacity: string }

export interface Floor {
  id: string;
  /** short label on the building, e.g. "G", "1" */
  short: string;
  level: string;
  kind: 'hall' | 'rooms';
  name: string;
  capacity: string;
  /** extra line under the capacity, e.g. "standing" */
  capacityNote?: string;
  summary: string;
  idealFor?: string[];
  highlights: string[];
  /** alternative layouts (ground floor splits in two) */
  setups?: Setup[];
  band: [top: number, bottom: number];
  /** the same floor in the portrait phone image (public/halls/front-mobile.webp) */
  bandM: [top: number, bottom: number];
  /** hall interior image in public/halls/interiors/ (shown when the floor is opened) */
  image?: string;
}

export const BUILDING_X: [left: number, right: number] = [0.074, 0.93];

export const floors: Floor[] = [
  {
    id: 'f7', short: '7', level: 'Seventh floor', kind: 'rooms', name: 'Guest rooms',
    capacity: '80 rooms', capacityNote: 'across floors 3, 4, 6 & 7',
    summary: 'Rooms for your family and guests, right above the celebration.',
    highlights: ['Stay on site with your event', 'Lift access to every hall'],
    band: [0.205, 0.28], bandM: [0.31, 0.37],
  },
  {
    id: 'f6', short: '6', level: 'Sixth floor', kind: 'rooms', name: 'Guest rooms',
    capacity: '80 rooms', capacityNote: 'across floors 3, 4, 6 & 7',
    summary: 'Rooms for your family and guests, right above the celebration.',
    highlights: ['Stay on site with your event', 'Lift access to every hall'],
    band: [0.28, 0.355], bandM: [0.37, 0.424],
  },
  {
    id: 'f5', short: '5', level: 'Fifth floor', kind: 'hall', name: 'Rooftop', image: 'rooftop.jpg',
    capacity: '500', capacityNote: 'guests',
    summary: 'An open-air rooftop above the city, made for evenings under the sky.',
    idealFor: ['Haldi & mehendi', 'Cocktail evenings', 'Sundowners', 'Get-togethers'],
    highlights: ['Open to the sky', 'Views across Nagpur'],
    band: [0.355, 0.435], bandM: [0.424, 0.477],
  },
  {
    id: 'f4', short: '4', level: 'Fourth floor', kind: 'rooms', name: 'Guest rooms',
    capacity: '80 rooms', capacityNote: 'across floors 3, 4, 6 & 7',
    summary: 'Rooms for your family and guests, right above the celebration.',
    highlights: ['Stay on site with your event', 'Lift access to every hall'],
    band: [0.435, 0.508], bandM: [0.477, 0.53],
  },
  {
    id: 'f3', short: '3', level: 'Third floor', kind: 'rooms', name: 'Guest rooms',
    capacity: '80 rooms', capacityNote: 'across floors 3, 4, 6 & 7',
    summary: 'Rooms for your family and guests, right above the celebration.',
    highlights: ['Stay on site with your event', 'Lift access to every hall'],
    band: [0.508, 0.582], bandM: [0.53, 0.58],
  },
  {
    id: 'f2', short: '2', level: 'Second floor', kind: 'hall', name: 'Horizon', image: 'banquet-hall.jpg',
    capacity: '1,500', capacityNote: 'guests standing',
    summary: 'A grand banquet hall for weddings, receptions and large gatherings.',
    idealFor: ['Weddings', 'Receptions', 'Sangeet', 'Corporate galas'],
    highlights: ['Second of the two grand halls'],
    band: [0.582, 0.645], bandM: [0.58, 0.627],
  },
  {
    id: 'f1', short: '1', level: 'First floor', kind: 'hall', name: 'Nova', image: 'grand-hall.jpg',
    capacity: '2,000', capacityNote: 'guests standing',
    summary: 'The largest hall at Celestia, for the grandest celebrations.',
    idealFor: ['Grand weddings', 'Receptions', 'Sangeet', 'Conferences'],
    highlights: ['Largest hall in the building'],
    band: [0.645, 0.71], bandM: [0.627, 0.675],
  },
  {
    id: 'g', short: 'G', level: 'Ground floor', kind: 'hall', name: 'Orion', image: 'ground-floor-hall.jpg',
    capacity: '400–500', capacityNote: 'guests, full hall',
    summary: 'A flexible hall that opens up for larger events or divides into two for smaller functions.',
    idealFor: ['Engagements', 'Birthdays', 'Intimate weddings', 'Corporate events'],
    highlights: ['Splits into two halls', 'Street-level arrival'],
    setups: [
      { label: 'Full hall', capacity: '400–500' },
      { label: 'Part 1', capacity: '200' },
      { label: 'Part 2', capacity: '200' },
    ],
    band: [0.71, 0.85], bandM: [0.676, 0.762],
  },
];

export interface Page {
  id: string;
  title: string;
  date: string;
  isJournalEntry?: boolean;
}

export interface Section {
  id: string;
  title: string;
  pages: Page[];
}

export interface Notebook {
  id: string;
  title: string;
  isJournal: boolean;
  sections: Section[];
}

export const initialMockData: Notebook[] = [
  {
    id: "nb-1",
    title: "Daily Journal",
    isJournal: true,
    sections: [
      {
        id: "sec-1",
        title: "Entries",
        pages: [
          {
            id: "page-1",
            title: "Thoughts on AI",
            date: "2026-07-17",
            isJournalEntry: true,
          }
        ]
      }
    ]
  },
  {
    id: "nb-2",
    title: "Project Zenith",
    isJournal: false,
    sections: [
      {
        id: "sec-2",
        title: "Planning",
        pages: [
          {
            id: "page-2",
            title: "Architecture",
            date: "2026-07-15",
          },
          {
            id: "page-3",
            title: "UI Designs",
            date: "2026-07-16",
          }
        ]
      },
      {
        id: "sec-3",
        title: "Meetings",
        pages: []
      }
    ]
  }
];

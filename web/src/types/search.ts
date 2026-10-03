export type SearchResult = {
  url: string;
  title: string;
  summary: string;
  content: string;
  images: string[];
  publishedAt: string;
  kind: 'reference' | 'web';
};

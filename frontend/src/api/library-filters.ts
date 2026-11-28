export const LIBRARY_FILTER_KEYS = [
  "genre",
  "min_rating",
  "year_min",
  "year_max",
  "sort",
  "order",
] as const;

export type LibraryFilterKey = (typeof LIBRARY_FILTER_KEYS)[number];

export const POLLING_INTERVAL = process.env.NODE_ENV !== 'production' ? 30000 : 5000;
export const POLLING_INTERVAL_AFTER_MUTATION = 2000;
export const AFTER_MUTATION_WINDOW = 6000;

export const LONG_LOADING_MESSAGE = 'For large environments, this may take several seconds.';

/** Playback with sound needs a prior user gesture. */
export function hasUserActivation(): boolean {
  return navigator.userActivation?.hasBeenActive ?? false;
}

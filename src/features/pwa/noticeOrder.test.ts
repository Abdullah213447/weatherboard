import { noticeToShow } from './noticeOrder';

const none = { updateReady: false, offlineReady: false, installable: false, cityLoaded: false };

describe('noticeToShow', () => {
  it('shows nothing when there is nothing to say', () => {
    expect(noticeToShow(none)).toBeNull();
  });

  it('puts the update prompt ahead of everything else', () => {
    expect(
      noticeToShow({ updateReady: true, offlineReady: true, installable: true, cityLoaded: true }),
    ).toBe('update');
  });

  it('then "Ready to use offline", ahead of the install card', () => {
    expect(noticeToShow({ ...none, offlineReady: true, installable: true, cityLoaded: true })).toBe(
      'offline-ready',
    );
  });

  it('then the install card, once it is the only thing left', () => {
    expect(noticeToShow({ ...none, installable: true, cityLoaded: true })).toBe('install');
  });

  it('holds the install card back until a first city has loaded', () => {
    expect(noticeToShow({ ...none, installable: true, cityLoaded: false })).toBeNull();
  });

  it('never returns the install card where installing is not possible', () => {
    expect(noticeToShow({ ...none, cityLoaded: true })).toBeNull();
  });
});

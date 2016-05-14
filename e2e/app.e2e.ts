import { EyeTunesPage } from './app.po';

describe('eye-tunes App', function() {
  let page: EyeTunesPage;

  beforeEach(() => {
    page = new EyeTunesPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('eye-tunes works!');
  });
});

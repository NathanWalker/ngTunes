export class EyeTunesPage {
  navigateTo() {
    return browser.get('/');
  }

  getParagraphText() {
    return element(by.css('eye-tunes-app h1')).getText();
  }
}

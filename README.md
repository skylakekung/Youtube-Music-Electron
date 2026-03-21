<!-- PROJECT LOGO -->

<br />
<div align="center">
  <a href="https://github.com/skylakekung/Youtube-Music-Electron">
    <img src="https://github.com/skylakekung/Youtube-Music-Electron/blob/main/incs.png" alt="Logo" width="256" height="256">
  </a>

  <h3 align="center">YouTube Music Electron</h3>

  <p align="center">
    A lightweight desktop client for YouTube Music built with Electron.
    <br />
    <br />
    <a href="https://github.com/skylakekung/Youtube-Music-Electron/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/skylakekung/Youtube-Music-Electron/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

---

> [!IMPORTANT]
> ⚠️ **Disclaimer**
>
> **No Affiliation**
> This project is not affiliated with, authorized by, endorsed by, or officially connected with Google LLC or YouTube.
> It is an independent, unofficial desktop client developed by volunteers.
>
> **Trademarks**
> "Google" and "YouTube Music" are trademarks of their respective owners.
> They are used for identification purposes only.
>
> **Limitation of Liability**
> This software is provided "AS IS", without warranty of any kind.
> You use it at your own risk.

---

## About The Project

<p align="center">
  <img src="https://github.com/skylakekung/Youtube-Music-Electron/blob/main/preview1.jpeg" width="45%">
  <img src="https://github.com/skylakekung/Youtube-Music-Electron/blob/main/preview2.jpeg" width="45%">
</p>

This project is inspired by [Pear Desktop](https://github.com/pear-devs/pear-desktop), but built from scratch as a personal implementation of a YouTube Music desktop experience.

### Notes

* Built using Electron and JavaScript, with assistance from AI tools(chatGPT, Gemini, and Claude) because I don't know shit how to code JS🤷‍♂️ (Atleast I know what they do.)
* Tested on macOS, Windows, and Linux (basic functionality confirmed).
* Contributions and improvements are welcome.

### Known Limitations

* Account switching currently requires clearing application data.
* UI effects (transparency / vibrancy) are experimental and may change.
* Some features and behaviors may be inconsistent across platforms.

### To do list
* <s>Fix some quirks with the current build on macOS.</s>

* <s>Add Linux and windows support for the blur effect.</s>

* Resolve corners not being rounded on Linux.
  
### Extensions

* Chrome extensions can be added manually by placing them in the `Extensions/` folder:

  ```
  Extensions/<extension-name>/manifest.json
  ```
* Recommended plugin (not included):
  ThemeSong for YouTube Music™ (Enhancer)

---

## Getting Started

### Prerequisites

* Node.js (recommended latest LTS)
* npm

Install npm (if needed):

```sh
npm install -g npm
```

---

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/skylakekung/Youtube-Music-Electron
   cd Youtube-Music-Electron
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Test run the application:

   ```sh
   npm run run
   ```

4. Build the application:

   ```sh
   npm run build
   ```

---

## Contributing

Contributions are welcome and appreciated.

If you would like to improve this project:

1. Fork the repository
2. Create a new branch (`feature/your-feature`)
3. Commit your changes
4. Push to your branch
5. Open a pull request

You can also open an issue for bugs or feature requests.

---

## License

No license is currently applied.
Go nuts, do whatever you want.

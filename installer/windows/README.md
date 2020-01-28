# Windows installer for suckerApp

## Build
Requires [NSIS 3.5](https://nsis.sourceforge.io/Main_Page) with installed plugin [AdvReplaceInFile](https://nsis.sourceforge.io/Advanced_Replace_within_text_II) and a `suckerApp.jar` in the `dist` directory. Build command:
```
makensis suckerApp.nsi
```

A new file `suckerApp.v0.2.3.setup.exe` will be created in the `dist` directory.

## License
Licensed under the MIT License.

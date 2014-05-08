crate-conZole
=============

An alternative SQL console for crate-data - made for interactive testing of [node-crate driver](https://github.com/megastef/node-crate)
Command history is stored in browser local storage.

![](http://techblog.bigdata-analyst.de/content/images/2014/May/Bildschirmfoto-2014-05-08-um-17-40-31.png)


## How to use
Change directory to your CRATE install dir

```
bin/plugin install  megastef/crate-conZole
```

Now you can access it in your browser (TextArea is now HTML based, in that way it is possible to use in future codemirror or ace editor functions)

```
http://localhost:4200/_plugin/crate-conZole/
```

Special thanks to [Zebra UI](http://www.zebkit.com/) - Java UI programmers feel like home, when creating javascript UI in HTML5 canvas. No DOM manipulation, CSS stress ...


#### Hotkeys

##### Mac

- Shift+Return - run
- Ctrl+m - settings menu  (Themes, Editor Modes etc.)
- Cmd+Alt+h - display all hotkeys
- fn+F1,F2,F3,F4 (e.g. F1 jumps into editor, F2 to list tab, F3 to Details, F4 to history)
- Arrow up/down - navigate in grid or select history item

##### Win  (untested, don't have it ...)
- Shift+Return - run
- Ctrl+m - settings menu
- Ctrl+Alt+h - display all hotkeys
- F1,F2,F3,F4 (e.g. F1 jumps into editor, F2 to list tab, F3 to Details, F4 to history)
- Arrow up/down - navigate in grid or select history item




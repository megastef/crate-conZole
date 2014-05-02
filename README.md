crate-conZole
=============

An alternative SQL console for crate-data - made for interactive testing of [node-crate driver](https://github.com/megastef/node-crate)

## How to use
Git clone the file and link or copy it to CRATE_INSTALL_DIR/plugins/conzole/_site

```
git clone https://github.com/megastef/crate-conZole.git
cd crate-conzole
export CRATE_DIR=~/crate-0.31.0
mkdir  $CRATE_DIR/plugins/conzole
ln -s . $CRATE_DIR/plugins/conzole/_site
```

Now you can access it with

```
http://localhost:4200/_plugin/conzole/index.html
```


A special thank to [Zebra UI](http://www.zebkit.com/) - Java UI programmers feel like home, when creating javascript UI in HTML5 canvas.
No DOM manipulation, CSS stress ...

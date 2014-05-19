var createApp = function (root) {

    var crate = require('node-crate');
    crate.connect(window.location.host, window.location.port);
    var font = new zebra.ui.Font("Arial", "bold", 18);
    //if (!localStorage)
    //    localStroage = {} // not html5??
    var historyHashMap = {};
    var history = [];
    if (window.localStorage.history) {
        history = JSON.parse(window.localStorage.getItem('history'))
        console.log('history:' + history)
        historyHashMap = JSON.parse(window.localStorage.historyHashMap)
    }

    var historyCombo = new zebra.ui.Combo(history);
    historyCombo.bind(function (combo, value) {
        if (value && value > -1) {
            //console.log (historyCombo.getValue().view.target);
            setSqlText( historyCombo.getValue().view.target + '');
            run.mousePressed()
        }
    });
    var tabs = new zebra.ui.Tabs();
    var keymap = {
        112: function () {
            window.editor.focus()
        },  // MAC fn+1
        113: function () {
            //window.alert('F2')
            tabs.select(0)
        },
        114: function () {
            tabs.select(1)
        },
        115: function () {
            historyCombo.requestFocus()
        },
        // ace has differnt names
        'f1': function () {
            taps.requestFocus()
            window.editor.focus()
        },  // MAC fn+1
        'f2': function () {
            //window.alert('F2')
            tabs.select(0)
        },
        'f3': function () {
            tabs.select(1)
        },
        'f4': function () {
            historyCombo.requestFocus()
        }
    }

    var handleKeys = function (e) {
        if (e.shiftKey && e.keyCode == 13) {
            run.mousePressed()

        }
        console.log(e.keyCode)
        if (keymap[e.keyCode]) {
            //alert(e.keyCode)
            keymap[e.keyCode].apply(this)
        }

    }
    $(myCanvas).bind('keydown', handleKeys);
    var self = this;
    // todo, separate keymaps
    var commands = Object.keys(keymap).map(function (i) {
        var command = {
            name: "switchUiTo" + i,
            bindKey: {mac: '' + i, win: '' + i},
            exec: function () {
                window.editor.blur();
                $(myCanvas).focus();
                keymap[i].apply(self)
            },
            readOnly: true
        }
        //console.log (command)
        return command;
    })
    // this command works still
    commands.push({
        name: "runSql",
        bindKey: {mac: "Shift-Enter", win: "Shift-Enter"},
        exec: function (editor) {
            run.mousePressed()
        },
        readOnly: true
    });

    commands.push({
        name: "showKeyboardShortcuts",
        bindKey: {win: "Ctrl-Alt-h", mac: "Command-Alt-h"},
        exec: function (editor) {
            ace.config.loadModule("ace/ext/keybinding_menu", function (module) {
                module.init(editor);
                editor.showKeyboardShortcuts()
            })
        }
    })
    window.editor.commands.addCommands(commands);


    var run = new zebra.ui.Button('Run');
    var grid = new zebra.ui.grid.Grid([
        [' Press run to execute query ']
    ]).properties({
            lineColor: '#DDDDDD'
        });
    //grid.setPreferredSize ([890,200])
    grid.setUsePsMetric(true);
    var hm, m;
    grid.bind(function (grid, row, count, status) {
        if (status && row >= 0 && count == 1) {
            createDetails(hm, m, row)
        }
    });
    //grid.setCellPadding(10);
    var errTxt = new zebra.ui.TextArea(" - status -").properties({
        font: font
    });

    var scrollPan = new zebra.ui.ScrollPan(grid);
    scrollPan.setSize(900, 500)
    var details = new zebra.ui.Panel(new zebra.layout.BorderLayout(0))

    tabs.add("List", scrollPan);

    var gui = new zebra.ui.Panel().properties({
        padding: 0,
        layout: new zebra.layout.BorderLayout(8),
        kids: {
            TOP: new zebra.ui.Panel().properties({
                layout: new zebra.layout.BorderLayout(8),
                kids: {

                    TOP: new zebra.ui.Panel().properties({
                        layout: new zebra.layout.BorderLayout(8),
                        kids: {
                            CENTER: historyCombo,
                            RIGHT: run
                        }
                    })
                }
            }),
            CENTER: tabs,
            BOTTOM: new zebra.ui.Panel(new zebra.layout.BorderLayout(0)).properties({
                kids: {
                    TOP: errTxt
                    //BOTTOM: details
                }
            })
        }})


    function updateUI(gridModel, headerModel, status, statusColor, historyEntry) {
        try {
            hm = headerModel;
            m = gridModel;
            var sql = getSqlText();
            scrollPan.setBackground(new zebra.ui.Gradient('white', "#FFF"))
            //scrollPan.removeAll()
            grid.removeAll()
            grid.setModel([])
            //grid.setVisible(true)
            grid.setUsePsMetric(false);
            var header = new zebra.ui.grid.CompGridCaption(headerModel).properties({
                isAutoFit: true,
                istResizeable: true,
                font: font,
                color: 'grey'
            });
            grid.setModel(gridModel)
            grid.setCellPadding(4)
            var tw = 0;
            for (var i = 0; i < headerModel.length; i++) {
                header.setSortable(i, true)
                var w = Math.min(grid.getColPSWidth(i) * 2, 160);

                grid.setColWidth(i, w);
                if (i === headerModel.length - 1 && tw < scrollPan.width) {
                    grid.setColWidth(i, scrollPan.width - tw)
                }
                tw = tw + w;
            }

            grid.add(zebra.layout.TOP, header)
            //scrollPan.add(zebra.layout.CENTER, grid);


            errTxt.setValue(status)
            errTxt.setColor(statusColor)
            if (historyEntry) {

                if (!historyHashMap[sql.toString()]) {
                    historyHashMap[sql.toString()] = true;
                    history.push(sql.toString());
                    if (history.length > 15) {
                        historyHashMap [ history.shift() ] = false;
                    }

                }
                if (window.localStorage) {
                    window.localStorage.historyHashMap = JSON.stringify(historyHashMap);
                    window.localStorage.history = JSON.stringify(history);
                }

                var l = new zebra.ui.CompList(history)
                for (i=0;i<history.length;i++)
                    if (history[i] == getSqlText())
                        l.select(i)
                historyCombo.setList(l);
                //console.log (txt.getValue().toString()) ;
            }
            grid.invalidateLayout()
            if (gridModel && gridModel.length > 0)
                grid.setRowsHeight(grid.getRowPSHeight(0))
            //scrollPan.invalidateLayout()
            createDetails(hm, m, 0)
        } catch (ex) {
            window.alert(ex)
        }

    }

    function getSqlText() {
        return window.editor.getSession().getValue();
    }

    function setSqlText(sql) {
        return window.editor.getSession().setValue(sql);
    }

    var detailsInit = false;
    var dp = null;

    function createDetails(headerModel, model, col) {

        if (!detailsInit) {
            var header = new zebra.ui.grid.CompGridCaption(['Field', 'Value']).properties({
                isAutoFit: true,
                istResizeable: true,
                font: font,
                color: 'grey'
            });
            var record = []
            for (i = 0; i < headerModel.length; i++) {
                var l = new zebra.ui.BoldLabel(headerModel[i]);
                record.push([headerModel[i], model[col][i]])
            }
            dp = new zebra.ui.grid.Grid(record).properties({
                lineColor: '#DDDDDD'
            });
            dp.add(zebra.layout.TOP, header);
            dp.setColWidth(0, 200);
            dp.setColWidth(1, 1100);
            details.removeAll();
            var z = new zebra.ui.Panel(new zebra.layout.BorderLayout(4))
            z.add(zebra.layout.CENTER, dp)
            var sp = new zebra.ui.ScrollPan(z)
            details.add(zebra.layout.CENTER, sp)
            tabs.add("Details", details);
            detailsInit = true;
        } else {
            var record = []
            for (i = 0; i < headerModel.length; i++) {
                var l = new zebra.ui.BoldLabel(headerModel[i]);
                record.push([headerModel[i], model[col][i]])
            }
            dp.setModel(record)
        }
    }

    run.mousePressed = function (e) {
        scrollPan.setBackground(new zebra.ui.Gradient("#CCC", "#FFFFFF"))
        //grid.setVisible(false);
        var sql = getSqlText();
        crate.execute(sql.toString())
            .success(function (res) {
                if (res.rowcount == 0) {
                    //return;
                    updateUI([
                            ['no results: ' + res.rowcount]
                        ], [' '],
                            res.rowcount + " Records selected in " + res.duration + " ms" + ' - Fields: ' + (res.cols || ''),
                        "steelblue",
                        sql.toString())
                    return;
                }
                var rows = res.rows || [];
                if (res.rows && res.rows.length > 0) {
                    rows = res.rows.map(function (e, i) {
                        return e.map(function (x, i) {

                            if (res.col_types && res.col_types[i] == crate.type.TIMESTAMP)
                                return new Date(x);
                            else  if (('' + x).search(/object/i) > -1)
                                return JSON.stringify(x)
                            else
                                return x;

                        });
                    })
                }
                updateUI(rows || [
                        [res.rowcount]
                    ], res.cols || ['count'],
                        res.rowcount + " Records selected in " + res.duration + " ms" + ' - Fields: ' + (res.cols || ''),
                    "steelblue",
                    sql.toString())
            })
            .error(function (err) {
                updateUI([
                    [err.message, err.code]
                ], ["Error", "Code"], err.message, "darkred", null)
            })


    }
    //run.mousePressed()
    return gui;

}

function download(filename, text) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);
    pom.click();
}
zebra.ready(function () {
    // create canvas 400x700 pixels
    //download( 'test.csv', '"test";"test"\n"1";"2"');
    //var app = require ('./conzole.js')
    var canvas = new zebra.ui.zCanvas("myCanvas");
    canvas.root.setLayout(new zebra.layout.BorderLayout(2))
    canvas.root.add(zebra.layout.CENTER, createApp(canvas.root))

    //run.mousePressed()
});

var createApp = function ()  {

    var crate = require('node-crate');
    crate.connect (window.location.host, window.location.port);

    var txt = new zebra.ui.TextField("select  * from tweets limit 500").properties ({
        preferredSize: [890,150],
        //background: new zebra.ui.Gradient("#EEEEEE", "white"),
        color: 'steelblue'
    });

    var history = ['select  * from tweets limit 500']
    var historyCombo = new zebra.ui.Combo(history);
    historyCombo.bind(function(combo, value) {
        if (value && value > -1 ){
            //console.log (historyCombo.getValue().view.target);
            txt.setValue(historyCombo.getValue().view.target);
            run.mousePressed()
        }
    });


    var run = new zebra.ui.Button ('Run');
    var grid = new zebra.ui.grid.Grid( [['                ']]);
    //grid.setPreferredSize ([890,200])
    grid.setUsePsMetric(true);
    grid.setCellPadding(10);
    var errTxt =  new zebra.ui.TextArea(" - status -");

    var scrollPan = new zebra.ui.ScrollPan (grid);

    var gui = new zebra.ui.Panel().properties ({
            padding: 0,
            layout : new zebra.layout.BorderLayout(0),
            kids   : {
                TOP:  new zebra.ui.Panel().properties( {
                        layout: new zebra.layout.BorderLayout(0),
                        kids: {
                            CENTER: txt,
                            BOTTOM: new zebra.ui.Panel().properties ({
                                            layout: new zebra.layout.BorderLayout(0),
                                            kids: {
                                                CENTER: historyCombo,
                                                RIGHT: run
                                            }
                                    })
                            }
                        }),
                CENTER: scrollPan,
                BOTTOM: errTxt
            }})

    function updateUI (gridModel, headerModel, status, statusColor, historyEntry)
    {
        grid.removeAll()
        grid.setModel([])

        var header = new zebra.ui.grid.GridCaption(headerModel).properties ({
            isAutoFit: true,
            istResizeable: true,
            isSortable: true
        });

        //header.setSortable (1,true)
        grid.add(zebra.layout.TOP, header);
        grid.setModel (gridModel)
        grid.add(zebra.layout.TOP, header)
        scrollPan.add (zebra.layout.CENTER, grid);
        grid.setUsePsMetric(true);
        grid.invalidate()
        errTxt.setValue (status)
        errTxt.setColor(statusColor)
        if (historyEntry) {
            if (history.length>15)
                history.shift();
            history.push (txt.getValue().toString());
            var l = new zebra.ui.CompList(history)
            l.select(history.length-1)
            historyCombo.setList (l);
            //console.log (txt.getValue().toString()) ;
        }
        grid.invalidateLayout()
        scrollPan.invalidateLayout()
    }
     run.mousePressed=function (e) {
         crate.execute ( txt.getValue().toString() )
            .success(function (res) {
                 var rows = res.rows;
                 if (res.rows)
                 {
                     rows = res.rows.map (function ( e, i) {
                         return e.map (function ( x, i) {
                             if ((''+x).search (/object/i) > -1)
                                 return JSON.stringify(x)
                             else
                                 return x;
                         });
                     })
                 }
                 updateUI (rows || [res.rowcount], res.cols || [],
                           res.rowcount + " Records selected in " + res.duration + " ms" + ' - Fields: ' + (res.cols||''),
                           "steelblue",
                           txt.getValue().toString() )

            })
            .error (function (err) {
                updateUI ([[err.message, err.code]], ["Error", "Code"],  err.message, "darkred", null)
            })

     }
    run.mousePressed()
    return gui;

}

zebra.ready(function() {
    // create canvas 400x700 pixels
    //var app = require ('./conzole.js')
    var canvas = new zebra.ui.zCanvas("myCanvas");
    canvas.root.setLayout(new zebra.layout.BorderLayout(2))
    canvas.root.add (zebra.layout.CENTER, createApp())
    //run.mousePressed()
});

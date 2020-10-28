/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 346.0, "minX": 0.0, "maxY": 2918.0, "series": [{"data": [[0.0, 346.0], [0.1, 346.0], [0.2, 346.0], [0.3, 346.0], [0.4, 346.0], [0.5, 346.0], [0.6, 346.0], [0.7, 346.0], [0.8, 346.0], [0.9, 347.0], [1.0, 347.0], [1.1, 347.0], [1.2, 347.0], [1.3, 347.0], [1.4, 347.0], [1.5, 347.0], [1.6, 347.0], [1.7, 347.0], [1.8, 347.0], [1.9, 347.0], [2.0, 347.0], [2.1, 347.0], [2.2, 347.0], [2.3, 347.0], [2.4, 347.0], [2.5, 348.0], [2.6, 348.0], [2.7, 348.0], [2.8, 348.0], [2.9, 348.0], [3.0, 348.0], [3.1, 348.0], [3.2, 348.0], [3.3, 348.0], [3.4, 348.0], [3.5, 348.0], [3.6, 348.0], [3.7, 348.0], [3.8, 348.0], [3.9, 348.0], [4.0, 348.0], [4.1, 348.0], [4.2, 348.0], [4.3, 348.0], [4.4, 348.0], [4.5, 348.0], [4.6, 348.0], [4.7, 348.0], [4.8, 348.0], [4.9, 348.0], [5.0, 348.0], [5.1, 348.0], [5.2, 348.0], [5.3, 348.0], [5.4, 348.0], [5.5, 348.0], [5.6, 348.0], [5.7, 348.0], [5.8, 348.0], [5.9, 348.0], [6.0, 348.0], [6.1, 348.0], [6.2, 348.0], [6.3, 348.0], [6.4, 348.0], [6.5, 348.0], [6.6, 348.0], [6.7, 349.0], [6.8, 349.0], [6.9, 349.0], [7.0, 349.0], [7.1, 349.0], [7.2, 349.0], [7.3, 349.0], [7.4, 349.0], [7.5, 349.0], [7.6, 349.0], [7.7, 349.0], [7.8, 349.0], [7.9, 349.0], [8.0, 349.0], [8.1, 349.0], [8.2, 349.0], [8.3, 350.0], [8.4, 350.0], [8.5, 350.0], [8.6, 350.0], [8.7, 350.0], [8.8, 350.0], [8.9, 350.0], [9.0, 350.0], [9.1, 351.0], [9.2, 351.0], [9.3, 351.0], [9.4, 351.0], [9.5, 351.0], [9.6, 351.0], [9.7, 351.0], [9.8, 351.0], [9.9, 351.0], [10.0, 351.0], [10.1, 351.0], [10.2, 351.0], [10.3, 351.0], [10.4, 351.0], [10.5, 351.0], [10.6, 351.0], [10.7, 351.0], [10.8, 352.0], [10.9, 352.0], [11.0, 352.0], [11.1, 352.0], [11.2, 352.0], [11.3, 352.0], [11.4, 352.0], [11.5, 352.0], [11.6, 352.0], [11.7, 352.0], [11.8, 352.0], [11.9, 352.0], [12.0, 352.0], [12.1, 352.0], [12.2, 352.0], [12.3, 352.0], [12.4, 352.0], [12.5, 352.0], [12.6, 352.0], [12.7, 352.0], [12.8, 352.0], [12.9, 352.0], [13.0, 352.0], [13.1, 352.0], [13.2, 352.0], [13.3, 353.0], [13.4, 353.0], [13.5, 353.0], [13.6, 353.0], [13.7, 353.0], [13.8, 353.0], [13.9, 353.0], [14.0, 353.0], [14.1, 354.0], [14.2, 354.0], [14.3, 354.0], [14.4, 354.0], [14.5, 354.0], [14.6, 354.0], [14.7, 354.0], [14.8, 354.0], [14.9, 354.0], [15.0, 354.0], [15.1, 354.0], [15.2, 354.0], [15.3, 354.0], [15.4, 354.0], [15.5, 354.0], [15.6, 354.0], [15.7, 354.0], [15.8, 355.0], [15.9, 355.0], [16.0, 355.0], [16.1, 355.0], [16.2, 355.0], [16.3, 355.0], [16.4, 355.0], [16.5, 355.0], [16.6, 357.0], [16.7, 357.0], [16.8, 357.0], [16.9, 357.0], [17.0, 357.0], [17.1, 357.0], [17.2, 357.0], [17.3, 357.0], [17.4, 359.0], [17.5, 359.0], [17.6, 359.0], [17.7, 359.0], [17.8, 359.0], [17.9, 359.0], [18.0, 359.0], [18.1, 359.0], [18.2, 359.0], [18.3, 359.0], [18.4, 359.0], [18.5, 359.0], [18.6, 359.0], [18.7, 359.0], [18.8, 359.0], [18.9, 359.0], [19.0, 359.0], [19.1, 360.0], [19.2, 360.0], [19.3, 360.0], [19.4, 360.0], [19.5, 360.0], [19.6, 360.0], [19.7, 360.0], [19.8, 360.0], [19.9, 361.0], [20.0, 361.0], [20.1, 361.0], [20.2, 361.0], [20.3, 361.0], [20.4, 361.0], [20.5, 361.0], [20.6, 361.0], [20.7, 361.0], [20.8, 361.0], [20.9, 361.0], [21.0, 361.0], [21.1, 361.0], [21.2, 361.0], [21.3, 361.0], [21.4, 361.0], [21.5, 362.0], [21.6, 362.0], [21.7, 362.0], [21.8, 362.0], [21.9, 362.0], [22.0, 362.0], [22.1, 362.0], [22.2, 362.0], [22.3, 362.0], [22.4, 362.0], [22.5, 362.0], [22.6, 362.0], [22.7, 362.0], [22.8, 362.0], [22.9, 362.0], [23.0, 362.0], [23.1, 362.0], [23.2, 362.0], [23.3, 362.0], [23.4, 362.0], [23.5, 362.0], [23.6, 362.0], [23.7, 362.0], [23.8, 362.0], [23.9, 362.0], [24.0, 362.0], [24.1, 362.0], [24.2, 362.0], [24.3, 362.0], [24.4, 362.0], [24.5, 362.0], [24.6, 362.0], [24.7, 362.0], [24.8, 362.0], [24.9, 362.0], [25.0, 362.0], [25.1, 362.0], [25.2, 362.0], [25.3, 362.0], [25.4, 362.0], [25.5, 362.0], [25.6, 362.0], [25.7, 363.0], [25.8, 363.0], [25.9, 363.0], [26.0, 363.0], [26.1, 363.0], [26.2, 363.0], [26.3, 363.0], [26.4, 363.0], [26.5, 363.0], [26.6, 363.0], [26.7, 363.0], [26.8, 363.0], [26.9, 363.0], [27.0, 363.0], [27.1, 363.0], [27.2, 363.0], [27.3, 364.0], [27.4, 364.0], [27.5, 364.0], [27.6, 364.0], [27.7, 364.0], [27.8, 364.0], [27.9, 364.0], [28.0, 364.0], [28.1, 365.0], [28.2, 365.0], [28.3, 365.0], [28.4, 365.0], [28.5, 365.0], [28.6, 365.0], [28.7, 365.0], [28.8, 365.0], [28.9, 365.0], [29.0, 365.0], [29.1, 365.0], [29.2, 365.0], [29.3, 365.0], [29.4, 365.0], [29.5, 365.0], [29.6, 365.0], [29.7, 365.0], [29.8, 366.0], [29.9, 366.0], [30.0, 366.0], [30.1, 366.0], [30.2, 366.0], [30.3, 366.0], [30.4, 366.0], [30.5, 366.0], [30.6, 367.0], [30.7, 367.0], [30.8, 367.0], [30.9, 367.0], [31.0, 367.0], [31.1, 367.0], [31.2, 367.0], [31.3, 367.0], [31.4, 367.0], [31.5, 367.0], [31.6, 367.0], [31.7, 367.0], [31.8, 367.0], [31.9, 367.0], [32.0, 367.0], [32.1, 367.0], [32.2, 367.0], [32.3, 369.0], [32.4, 369.0], [32.5, 369.0], [32.6, 369.0], [32.7, 369.0], [32.8, 369.0], [32.9, 369.0], [33.0, 369.0], [33.1, 371.0], [33.2, 371.0], [33.3, 371.0], [33.4, 371.0], [33.5, 371.0], [33.6, 371.0], [33.7, 371.0], [33.8, 371.0], [33.9, 372.0], [34.0, 372.0], [34.1, 372.0], [34.2, 372.0], [34.3, 372.0], [34.4, 372.0], [34.5, 372.0], [34.6, 372.0], [34.7, 372.0], [34.8, 373.0], [34.9, 373.0], [35.0, 373.0], [35.1, 373.0], [35.2, 373.0], [35.3, 373.0], [35.4, 373.0], [35.5, 373.0], [35.6, 375.0], [35.7, 375.0], [35.8, 375.0], [35.9, 375.0], [36.0, 375.0], [36.1, 375.0], [36.2, 375.0], [36.3, 375.0], [36.4, 379.0], [36.5, 379.0], [36.6, 379.0], [36.7, 379.0], [36.8, 379.0], [36.9, 379.0], [37.0, 379.0], [37.1, 379.0], [37.2, 380.0], [37.3, 380.0], [37.4, 380.0], [37.5, 380.0], [37.6, 380.0], [37.7, 380.0], [37.8, 380.0], [37.9, 380.0], [38.0, 380.0], [38.1, 380.0], [38.2, 380.0], [38.3, 380.0], [38.4, 380.0], [38.5, 380.0], [38.6, 380.0], [38.7, 380.0], [38.8, 380.0], [38.9, 381.0], [39.0, 381.0], [39.1, 381.0], [39.2, 381.0], [39.3, 381.0], [39.4, 381.0], [39.5, 381.0], [39.6, 381.0], [39.7, 383.0], [39.8, 383.0], [39.9, 383.0], [40.0, 383.0], [40.1, 383.0], [40.2, 383.0], [40.3, 383.0], [40.4, 383.0], [40.5, 383.0], [40.6, 383.0], [40.7, 383.0], [40.8, 383.0], [40.9, 383.0], [41.0, 383.0], [41.1, 383.0], [41.2, 383.0], [41.3, 383.0], [41.4, 383.0], [41.5, 383.0], [41.6, 383.0], [41.7, 383.0], [41.8, 383.0], [41.9, 383.0], [42.0, 383.0], [42.1, 383.0], [42.2, 384.0], [42.3, 384.0], [42.4, 384.0], [42.5, 384.0], [42.6, 384.0], [42.7, 384.0], [42.8, 384.0], [42.9, 384.0], [43.0, 386.0], [43.1, 386.0], [43.2, 386.0], [43.3, 386.0], [43.4, 386.0], [43.5, 386.0], [43.6, 386.0], [43.7, 386.0], [43.8, 386.0], [43.9, 387.0], [44.0, 387.0], [44.1, 387.0], [44.2, 387.0], [44.3, 387.0], [44.4, 387.0], [44.5, 387.0], [44.6, 387.0], [44.7, 388.0], [44.8, 388.0], [44.9, 388.0], [45.0, 388.0], [45.1, 388.0], [45.2, 388.0], [45.3, 388.0], [45.4, 388.0], [45.5, 388.0], [45.6, 388.0], [45.7, 388.0], [45.8, 388.0], [45.9, 388.0], [46.0, 388.0], [46.1, 388.0], [46.2, 388.0], [46.3, 388.0], [46.4, 388.0], [46.5, 388.0], [46.6, 388.0], [46.7, 388.0], [46.8, 388.0], [46.9, 388.0], [47.0, 388.0], [47.1, 388.0], [47.2, 389.0], [47.3, 389.0], [47.4, 389.0], [47.5, 389.0], [47.6, 389.0], [47.7, 389.0], [47.8, 389.0], [47.9, 389.0], [48.0, 389.0], [48.1, 389.0], [48.2, 389.0], [48.3, 389.0], [48.4, 389.0], [48.5, 389.0], [48.6, 389.0], [48.7, 389.0], [48.8, 391.0], [48.9, 391.0], [49.0, 391.0], [49.1, 391.0], [49.2, 391.0], [49.3, 391.0], [49.4, 391.0], [49.5, 391.0], [49.6, 395.0], [49.7, 395.0], [49.8, 395.0], [49.9, 395.0], [50.0, 395.0], [50.1, 395.0], [50.2, 395.0], [50.3, 395.0], [50.4, 395.0], [50.5, 396.0], [50.6, 396.0], [50.7, 396.0], [50.8, 396.0], [50.9, 396.0], [51.0, 396.0], [51.1, 396.0], [51.2, 396.0], [51.3, 396.0], [51.4, 396.0], [51.5, 396.0], [51.6, 396.0], [51.7, 396.0], [51.8, 396.0], [51.9, 396.0], [52.0, 396.0], [52.1, 402.0], [52.2, 402.0], [52.3, 402.0], [52.4, 402.0], [52.5, 402.0], [52.6, 402.0], [52.7, 402.0], [52.8, 402.0], [52.9, 405.0], [53.0, 405.0], [53.1, 405.0], [53.2, 405.0], [53.3, 405.0], [53.4, 405.0], [53.5, 405.0], [53.6, 405.0], [53.7, 405.0], [53.8, 408.0], [53.9, 408.0], [54.0, 408.0], [54.1, 408.0], [54.2, 408.0], [54.3, 408.0], [54.4, 408.0], [54.5, 408.0], [54.6, 420.0], [54.7, 420.0], [54.8, 420.0], [54.9, 420.0], [55.0, 420.0], [55.1, 420.0], [55.2, 420.0], [55.3, 420.0], [55.4, 423.0], [55.5, 423.0], [55.6, 423.0], [55.7, 423.0], [55.8, 423.0], [55.9, 423.0], [56.0, 423.0], [56.1, 423.0], [56.2, 423.0], [56.3, 423.0], [56.4, 423.0], [56.5, 423.0], [56.6, 423.0], [56.7, 423.0], [56.8, 423.0], [56.9, 423.0], [57.0, 423.0], [57.1, 424.0], [57.2, 424.0], [57.3, 424.0], [57.4, 424.0], [57.5, 424.0], [57.6, 424.0], [57.7, 424.0], [57.8, 424.0], [57.9, 425.0], [58.0, 425.0], [58.1, 425.0], [58.2, 425.0], [58.3, 425.0], [58.4, 425.0], [58.5, 425.0], [58.6, 425.0], [58.7, 426.0], [58.8, 426.0], [58.9, 426.0], [59.0, 426.0], [59.1, 426.0], [59.2, 426.0], [59.3, 426.0], [59.4, 426.0], [59.5, 426.0], [59.6, 428.0], [59.7, 428.0], [59.8, 428.0], [59.9, 428.0], [60.0, 428.0], [60.1, 428.0], [60.2, 428.0], [60.3, 428.0], [60.4, 652.0], [60.5, 652.0], [60.6, 652.0], [60.7, 652.0], [60.8, 652.0], [60.9, 652.0], [61.0, 652.0], [61.1, 652.0], [61.2, 802.0], [61.3, 802.0], [61.4, 802.0], [61.5, 802.0], [61.6, 802.0], [61.7, 802.0], [61.8, 802.0], [61.9, 802.0], [62.0, 812.0], [62.1, 812.0], [62.2, 812.0], [62.3, 812.0], [62.4, 812.0], [62.5, 812.0], [62.6, 812.0], [62.7, 812.0], [62.8, 812.0], [62.9, 1114.0], [63.0, 1114.0], [63.1, 1114.0], [63.2, 1114.0], [63.3, 1114.0], [63.4, 1114.0], [63.5, 1114.0], [63.6, 1114.0], [63.7, 1114.0], [63.8, 1114.0], [63.9, 1114.0], [64.0, 1114.0], [64.1, 1114.0], [64.2, 1114.0], [64.3, 1114.0], [64.4, 1114.0], [64.5, 1121.0], [64.6, 1121.0], [64.7, 1121.0], [64.8, 1121.0], [64.9, 1121.0], [65.0, 1121.0], [65.1, 1121.0], [65.2, 1121.0], [65.3, 1123.0], [65.4, 1123.0], [65.5, 1123.0], [65.6, 1123.0], [65.7, 1123.0], [65.8, 1123.0], [65.9, 1123.0], [66.0, 1123.0], [66.1, 1123.0], [66.2, 1133.0], [66.3, 1133.0], [66.4, 1133.0], [66.5, 1133.0], [66.6, 1133.0], [66.7, 1133.0], [66.8, 1133.0], [66.9, 1133.0], [67.0, 1140.0], [67.1, 1140.0], [67.2, 1140.0], [67.3, 1140.0], [67.4, 1140.0], [67.5, 1140.0], [67.6, 1140.0], [67.7, 1140.0], [67.8, 1150.0], [67.9, 1150.0], [68.0, 1150.0], [68.1, 1150.0], [68.2, 1150.0], [68.3, 1150.0], [68.4, 1150.0], [68.5, 1150.0], [68.6, 1155.0], [68.7, 1155.0], [68.8, 1155.0], [68.9, 1155.0], [69.0, 1155.0], [69.1, 1155.0], [69.2, 1155.0], [69.3, 1155.0], [69.4, 1155.0], [69.5, 1162.0], [69.6, 1162.0], [69.7, 1162.0], [69.8, 1162.0], [69.9, 1162.0], [70.0, 1162.0], [70.1, 1162.0], [70.2, 1162.0], [70.3, 1164.0], [70.4, 1164.0], [70.5, 1164.0], [70.6, 1164.0], [70.7, 1164.0], [70.8, 1164.0], [70.9, 1164.0], [71.0, 1164.0], [71.1, 1172.0], [71.2, 1172.0], [71.3, 1172.0], [71.4, 1172.0], [71.5, 1172.0], [71.6, 1172.0], [71.7, 1172.0], [71.8, 1172.0], [71.9, 1172.0], [72.0, 1175.0], [72.1, 1175.0], [72.2, 1175.0], [72.3, 1175.0], [72.4, 1175.0], [72.5, 1175.0], [72.6, 1175.0], [72.7, 1175.0], [72.8, 1178.0], [72.9, 1178.0], [73.0, 1178.0], [73.1, 1178.0], [73.2, 1178.0], [73.3, 1178.0], [73.4, 1178.0], [73.5, 1178.0], [73.6, 1179.0], [73.7, 1179.0], [73.8, 1179.0], [73.9, 1179.0], [74.0, 1179.0], [74.1, 1179.0], [74.2, 1179.0], [74.3, 1179.0], [74.4, 1187.0], [74.5, 1187.0], [74.6, 1187.0], [74.7, 1187.0], [74.8, 1187.0], [74.9, 1187.0], [75.0, 1187.0], [75.1, 1187.0], [75.2, 1187.0], [75.3, 1202.0], [75.4, 1202.0], [75.5, 1202.0], [75.6, 1202.0], [75.7, 1202.0], [75.8, 1202.0], [75.9, 1202.0], [76.0, 1202.0], [76.1, 1262.0], [76.2, 1262.0], [76.3, 1262.0], [76.4, 1262.0], [76.5, 1262.0], [76.6, 1262.0], [76.7, 1262.0], [76.8, 1262.0], [76.9, 1287.0], [77.0, 1287.0], [77.1, 1287.0], [77.2, 1287.0], [77.3, 1287.0], [77.4, 1287.0], [77.5, 1287.0], [77.6, 1287.0], [77.7, 1289.0], [77.8, 1289.0], [77.9, 1289.0], [78.0, 1289.0], [78.1, 1289.0], [78.2, 1289.0], [78.3, 1289.0], [78.4, 1289.0], [78.5, 1289.0], [78.6, 1292.0], [78.7, 1292.0], [78.8, 1292.0], [78.9, 1292.0], [79.0, 1292.0], [79.1, 1292.0], [79.2, 1292.0], [79.3, 1292.0], [79.4, 1298.0], [79.5, 1298.0], [79.6, 1298.0], [79.7, 1298.0], [79.8, 1298.0], [79.9, 1298.0], [80.0, 1298.0], [80.1, 1298.0], [80.2, 1300.0], [80.3, 1300.0], [80.4, 1300.0], [80.5, 1300.0], [80.6, 1300.0], [80.7, 1300.0], [80.8, 1300.0], [80.9, 1300.0], [81.0, 1309.0], [81.1, 1309.0], [81.2, 1309.0], [81.3, 1309.0], [81.4, 1309.0], [81.5, 1309.0], [81.6, 1309.0], [81.7, 1309.0], [81.8, 1309.0], [81.9, 1312.0], [82.0, 1312.0], [82.1, 1312.0], [82.2, 1312.0], [82.3, 1312.0], [82.4, 1312.0], [82.5, 1312.0], [82.6, 1312.0], [82.7, 1316.0], [82.8, 1316.0], [82.9, 1316.0], [83.0, 1316.0], [83.1, 1316.0], [83.2, 1316.0], [83.3, 1316.0], [83.4, 1316.0], [83.5, 1319.0], [83.6, 1319.0], [83.7, 1319.0], [83.8, 1319.0], [83.9, 1319.0], [84.0, 1319.0], [84.1, 1319.0], [84.2, 1319.0], [84.3, 1320.0], [84.4, 1320.0], [84.5, 1320.0], [84.6, 1320.0], [84.7, 1320.0], [84.8, 1320.0], [84.9, 1320.0], [85.0, 1320.0], [85.1, 1320.0], [85.2, 1329.0], [85.3, 1329.0], [85.4, 1329.0], [85.5, 1329.0], [85.6, 1329.0], [85.7, 1329.0], [85.8, 1329.0], [85.9, 1329.0], [86.0, 1329.0], [86.1, 1329.0], [86.2, 1329.0], [86.3, 1329.0], [86.4, 1329.0], [86.5, 1329.0], [86.6, 1329.0], [86.7, 1329.0], [86.8, 1333.0], [86.9, 1333.0], [87.0, 1333.0], [87.1, 1333.0], [87.2, 1333.0], [87.3, 1333.0], [87.4, 1333.0], [87.5, 1333.0], [87.6, 1333.0], [87.7, 1335.0], [87.8, 1335.0], [87.9, 1335.0], [88.0, 1335.0], [88.1, 1335.0], [88.2, 1335.0], [88.3, 1335.0], [88.4, 1335.0], [88.5, 1342.0], [88.6, 1342.0], [88.7, 1342.0], [88.8, 1342.0], [88.9, 1342.0], [89.0, 1342.0], [89.1, 1342.0], [89.2, 1342.0], [89.3, 1349.0], [89.4, 1349.0], [89.5, 1349.0], [89.6, 1349.0], [89.7, 1349.0], [89.8, 1349.0], [89.9, 1349.0], [90.0, 1349.0], [90.1, 1352.0], [90.2, 1352.0], [90.3, 1352.0], [90.4, 1352.0], [90.5, 1352.0], [90.6, 1352.0], [90.7, 1352.0], [90.8, 1352.0], [90.9, 1352.0], [91.0, 1360.0], [91.1, 1360.0], [91.2, 1360.0], [91.3, 1360.0], [91.4, 1360.0], [91.5, 1360.0], [91.6, 1360.0], [91.7, 1360.0], [91.8, 1361.0], [91.9, 1361.0], [92.0, 1361.0], [92.1, 1361.0], [92.2, 1361.0], [92.3, 1361.0], [92.4, 1361.0], [92.5, 1361.0], [92.6, 1369.0], [92.7, 1369.0], [92.8, 1369.0], [92.9, 1369.0], [93.0, 1369.0], [93.1, 1369.0], [93.2, 1369.0], [93.3, 1369.0], [93.4, 1379.0], [93.5, 1379.0], [93.6, 1379.0], [93.7, 1379.0], [93.8, 1379.0], [93.9, 1379.0], [94.0, 1379.0], [94.1, 1379.0], [94.2, 1379.0], [94.3, 1432.0], [94.4, 1432.0], [94.5, 1432.0], [94.6, 1432.0], [94.7, 1432.0], [94.8, 1432.0], [94.9, 1432.0], [95.0, 1432.0], [95.1, 1529.0], [95.2, 1529.0], [95.3, 1529.0], [95.4, 1529.0], [95.5, 1529.0], [95.6, 1529.0], [95.7, 1529.0], [95.8, 1529.0], [95.9, 1640.0], [96.0, 1640.0], [96.1, 1640.0], [96.2, 1640.0], [96.3, 1640.0], [96.4, 1640.0], [96.5, 1640.0], [96.6, 1640.0], [96.7, 1898.0], [96.8, 1898.0], [96.9, 1898.0], [97.0, 1898.0], [97.1, 1898.0], [97.2, 1898.0], [97.3, 1898.0], [97.4, 1898.0], [97.5, 1898.0], [97.6, 2232.0], [97.7, 2232.0], [97.8, 2232.0], [97.9, 2232.0], [98.0, 2232.0], [98.1, 2232.0], [98.2, 2232.0], [98.3, 2232.0], [98.4, 2623.0], [98.5, 2623.0], [98.6, 2623.0], [98.7, 2623.0], [98.8, 2623.0], [98.9, 2623.0], [99.0, 2623.0], [99.1, 2623.0], [99.2, 2918.0], [99.3, 2918.0], [99.4, 2918.0], [99.5, 2918.0], [99.6, 2918.0], [99.7, 2918.0], [99.8, 2918.0], [99.9, 2918.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 73.0, "series": [{"data": [[0.0, 73.0], [2500.0, 2.0], [1500.0, 3.0], [1000.0, 39.0], [2000.0, 1.0], [500.0, 3.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 2500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 6.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 73.0, "series": [{"data": [[1.0, 42.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 73.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 6.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 2.925619834710743, "minX": 1.6038726E12, "maxY": 2.925619834710743, "series": [{"data": [[1.6038726E12, 2.925619834710743]], "isOverall": false, "label": "线程组", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038726E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 730.6608695652171, "minX": 1.0, "maxY": 1327.6666666666667, "series": [{"data": [[2.0, 1327.6666666666667], [1.0, 1139.6666666666667], [3.0, 730.6608695652171]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[2.925619834710743, 755.6033057851245]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 3.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 235.95, "minX": 1.6038726E12, "maxY": 5035.616666666667, "series": [{"data": [[1.6038726E12, 5035.616666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.6038726E12, 235.95]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038726E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 755.6033057851245, "minX": 1.6038726E12, "maxY": 755.6033057851245, "series": [{"data": [[1.6038726E12, 755.6033057851245]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038726E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 755.5619834710744, "minX": 1.6038726E12, "maxY": 755.5619834710744, "series": [{"data": [[1.6038726E12, 755.5619834710744]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038726E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 367.14876033057857, "minX": 1.6038726E12, "maxY": 367.14876033057857, "series": [{"data": [[1.6038726E12, 367.14876033057857]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038726E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 346.0, "minX": 1.6038726E12, "maxY": 2918.0, "series": [{"data": [[1.6038726E12, 2918.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.6038726E12, 346.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.6038726E12, 1351.4]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.6038726E12, 2853.1000000000004]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.6038726E12, 1519.2999999999993]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038726E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 395.0, "minX": 2.0, "maxY": 395.0, "series": [{"data": [[2.0, 395.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 395.0, "minX": 2.0, "maxY": 395.0, "series": [{"data": [[2.0, 395.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 2.0166666666666666, "minX": 1.6038726E12, "maxY": 2.0166666666666666, "series": [{"data": [[1.6038726E12, 2.0166666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038726E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 2.0166666666666666, "minX": 1.6038726E12, "maxY": 2.0166666666666666, "series": [{"data": [[1.6038726E12, 2.0166666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038726E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 2.0166666666666666, "minX": 1.6038726E12, "maxY": 2.0166666666666666, "series": [{"data": [[1.6038726E12, 2.0166666666666666]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038726E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}

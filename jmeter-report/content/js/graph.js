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
        data: {"result": {"minY": 42.0, "minX": 0.0, "maxY": 5762.0, "series": [{"data": [[0.0, 42.0], [0.1, 44.0], [0.2, 46.0], [0.3, 47.0], [0.4, 48.0], [0.5, 48.0], [0.6, 49.0], [0.7, 50.0], [0.8, 50.0], [0.9, 51.0], [1.0, 51.0], [1.1, 52.0], [1.2, 52.0], [1.3, 53.0], [1.4, 53.0], [1.5, 53.0], [1.6, 54.0], [1.7, 54.0], [1.8, 54.0], [1.9, 55.0], [2.0, 55.0], [2.1, 55.0], [2.2, 56.0], [2.3, 56.0], [2.4, 57.0], [2.5, 58.0], [2.6, 59.0], [2.7, 60.0], [2.8, 60.0], [2.9, 61.0], [3.0, 61.0], [3.1, 61.0], [3.2, 62.0], [3.3, 63.0], [3.4, 63.0], [3.5, 63.0], [3.6, 64.0], [3.7, 64.0], [3.8, 65.0], [3.9, 66.0], [4.0, 66.0], [4.1, 66.0], [4.2, 67.0], [4.3, 67.0], [4.4, 67.0], [4.5, 68.0], [4.6, 69.0], [4.7, 69.0], [4.8, 69.0], [4.9, 70.0], [5.0, 71.0], [5.1, 71.0], [5.2, 71.0], [5.3, 72.0], [5.4, 72.0], [5.5, 72.0], [5.6, 72.0], [5.7, 73.0], [5.8, 73.0], [5.9, 75.0], [6.0, 75.0], [6.1, 75.0], [6.2, 76.0], [6.3, 77.0], [6.4, 77.0], [6.5, 77.0], [6.6, 78.0], [6.7, 78.0], [6.8, 78.0], [6.9, 78.0], [7.0, 78.0], [7.1, 78.0], [7.2, 79.0], [7.3, 79.0], [7.4, 79.0], [7.5, 79.0], [7.6, 79.0], [7.7, 79.0], [7.8, 80.0], [7.9, 80.0], [8.0, 80.0], [8.1, 80.0], [8.2, 80.0], [8.3, 80.0], [8.4, 81.0], [8.5, 81.0], [8.6, 81.0], [8.7, 81.0], [8.8, 81.0], [8.9, 82.0], [9.0, 82.0], [9.1, 82.0], [9.2, 82.0], [9.3, 82.0], [9.4, 82.0], [9.5, 82.0], [9.6, 82.0], [9.7, 82.0], [9.8, 83.0], [9.9, 83.0], [10.0, 83.0], [10.1, 83.0], [10.2, 83.0], [10.3, 84.0], [10.4, 84.0], [10.5, 84.0], [10.6, 85.0], [10.7, 85.0], [10.8, 86.0], [10.9, 86.0], [11.0, 86.0], [11.1, 86.0], [11.2, 86.0], [11.3, 86.0], [11.4, 86.0], [11.5, 87.0], [11.6, 87.0], [11.7, 87.0], [11.8, 87.0], [11.9, 88.0], [12.0, 88.0], [12.1, 88.0], [12.2, 88.0], [12.3, 89.0], [12.4, 89.0], [12.5, 89.0], [12.6, 89.0], [12.7, 89.0], [12.8, 89.0], [12.9, 89.0], [13.0, 90.0], [13.1, 90.0], [13.2, 90.0], [13.3, 90.0], [13.4, 90.0], [13.5, 90.0], [13.6, 91.0], [13.7, 91.0], [13.8, 91.0], [13.9, 91.0], [14.0, 91.0], [14.1, 92.0], [14.2, 92.0], [14.3, 92.0], [14.4, 92.0], [14.5, 92.0], [14.6, 92.0], [14.7, 93.0], [14.8, 93.0], [14.9, 93.0], [15.0, 93.0], [15.1, 94.0], [15.2, 94.0], [15.3, 94.0], [15.4, 94.0], [15.5, 95.0], [15.6, 95.0], [15.7, 95.0], [15.8, 95.0], [15.9, 96.0], [16.0, 96.0], [16.1, 96.0], [16.2, 96.0], [16.3, 96.0], [16.4, 96.0], [16.5, 97.0], [16.6, 97.0], [16.7, 97.0], [16.8, 97.0], [16.9, 97.0], [17.0, 97.0], [17.1, 97.0], [17.2, 97.0], [17.3, 98.0], [17.4, 98.0], [17.5, 98.0], [17.6, 98.0], [17.7, 99.0], [17.8, 99.0], [17.9, 99.0], [18.0, 99.0], [18.1, 99.0], [18.2, 99.0], [18.3, 100.0], [18.4, 100.0], [18.5, 100.0], [18.6, 100.0], [18.7, 100.0], [18.8, 101.0], [18.9, 101.0], [19.0, 101.0], [19.1, 101.0], [19.2, 101.0], [19.3, 101.0], [19.4, 101.0], [19.5, 102.0], [19.6, 102.0], [19.7, 102.0], [19.8, 102.0], [19.9, 102.0], [20.0, 102.0], [20.1, 102.0], [20.2, 103.0], [20.3, 103.0], [20.4, 103.0], [20.5, 103.0], [20.6, 103.0], [20.7, 103.0], [20.8, 103.0], [20.9, 103.0], [21.0, 103.0], [21.1, 104.0], [21.2, 104.0], [21.3, 104.0], [21.4, 104.0], [21.5, 104.0], [21.6, 104.0], [21.7, 104.0], [21.8, 104.0], [21.9, 105.0], [22.0, 105.0], [22.1, 105.0], [22.2, 106.0], [22.3, 106.0], [22.4, 106.0], [22.5, 106.0], [22.6, 106.0], [22.7, 107.0], [22.8, 107.0], [22.9, 107.0], [23.0, 107.0], [23.1, 108.0], [23.2, 108.0], [23.3, 108.0], [23.4, 108.0], [23.5, 108.0], [23.6, 109.0], [23.7, 109.0], [23.8, 109.0], [23.9, 109.0], [24.0, 109.0], [24.1, 110.0], [24.2, 110.0], [24.3, 110.0], [24.4, 110.0], [24.5, 111.0], [24.6, 111.0], [24.7, 111.0], [24.8, 111.0], [24.9, 112.0], [25.0, 112.0], [25.1, 112.0], [25.2, 112.0], [25.3, 112.0], [25.4, 112.0], [25.5, 112.0], [25.6, 113.0], [25.7, 113.0], [25.8, 113.0], [25.9, 113.0], [26.0, 113.0], [26.1, 114.0], [26.2, 114.0], [26.3, 114.0], [26.4, 114.0], [26.5, 115.0], [26.6, 115.0], [26.7, 115.0], [26.8, 115.0], [26.9, 116.0], [27.0, 116.0], [27.1, 116.0], [27.2, 117.0], [27.3, 117.0], [27.4, 117.0], [27.5, 117.0], [27.6, 118.0], [27.7, 118.0], [27.8, 118.0], [27.9, 118.0], [28.0, 118.0], [28.1, 119.0], [28.2, 120.0], [28.3, 120.0], [28.4, 120.0], [28.5, 121.0], [28.6, 121.0], [28.7, 122.0], [28.8, 122.0], [28.9, 122.0], [29.0, 123.0], [29.1, 123.0], [29.2, 123.0], [29.3, 123.0], [29.4, 123.0], [29.5, 123.0], [29.6, 124.0], [29.7, 124.0], [29.8, 124.0], [29.9, 124.0], [30.0, 124.0], [30.1, 124.0], [30.2, 124.0], [30.3, 125.0], [30.4, 125.0], [30.5, 125.0], [30.6, 126.0], [30.7, 126.0], [30.8, 126.0], [30.9, 126.0], [31.0, 126.0], [31.1, 127.0], [31.2, 127.0], [31.3, 128.0], [31.4, 128.0], [31.5, 128.0], [31.6, 130.0], [31.7, 131.0], [31.8, 148.0], [31.9, 170.0], [32.0, 189.0], [32.1, 194.0], [32.2, 209.0], [32.3, 220.0], [32.4, 241.0], [32.5, 313.0], [32.6, 348.0], [32.7, 349.0], [32.8, 350.0], [32.9, 351.0], [33.0, 351.0], [33.1, 353.0], [33.2, 354.0], [33.3, 355.0], [33.4, 356.0], [33.5, 357.0], [33.6, 357.0], [33.7, 357.0], [33.8, 358.0], [33.9, 359.0], [34.0, 360.0], [34.1, 360.0], [34.2, 361.0], [34.3, 361.0], [34.4, 361.0], [34.5, 362.0], [34.6, 362.0], [34.7, 363.0], [34.8, 363.0], [34.9, 364.0], [35.0, 364.0], [35.1, 364.0], [35.2, 364.0], [35.3, 366.0], [35.4, 366.0], [35.5, 366.0], [35.6, 367.0], [35.7, 368.0], [35.8, 368.0], [35.9, 368.0], [36.0, 369.0], [36.1, 369.0], [36.2, 370.0], [36.3, 370.0], [36.4, 371.0], [36.5, 371.0], [36.6, 371.0], [36.7, 371.0], [36.8, 372.0], [36.9, 373.0], [37.0, 373.0], [37.1, 374.0], [37.2, 374.0], [37.3, 374.0], [37.4, 375.0], [37.5, 376.0], [37.6, 376.0], [37.7, 376.0], [37.8, 376.0], [37.9, 377.0], [38.0, 377.0], [38.1, 377.0], [38.2, 377.0], [38.3, 378.0], [38.4, 378.0], [38.5, 378.0], [38.6, 379.0], [38.7, 379.0], [38.8, 379.0], [38.9, 379.0], [39.0, 380.0], [39.1, 380.0], [39.2, 381.0], [39.3, 381.0], [39.4, 381.0], [39.5, 381.0], [39.6, 381.0], [39.7, 382.0], [39.8, 382.0], [39.9, 382.0], [40.0, 383.0], [40.1, 383.0], [40.2, 383.0], [40.3, 383.0], [40.4, 383.0], [40.5, 384.0], [40.6, 384.0], [40.7, 384.0], [40.8, 384.0], [40.9, 385.0], [41.0, 385.0], [41.1, 385.0], [41.2, 385.0], [41.3, 386.0], [41.4, 386.0], [41.5, 387.0], [41.6, 387.0], [41.7, 387.0], [41.8, 388.0], [41.9, 388.0], [42.0, 388.0], [42.1, 389.0], [42.2, 389.0], [42.3, 389.0], [42.4, 390.0], [42.5, 390.0], [42.6, 390.0], [42.7, 390.0], [42.8, 391.0], [42.9, 391.0], [43.0, 391.0], [43.1, 391.0], [43.2, 391.0], [43.3, 391.0], [43.4, 391.0], [43.5, 392.0], [43.6, 392.0], [43.7, 392.0], [43.8, 392.0], [43.9, 393.0], [44.0, 393.0], [44.1, 393.0], [44.2, 393.0], [44.3, 393.0], [44.4, 393.0], [44.5, 393.0], [44.6, 393.0], [44.7, 394.0], [44.8, 394.0], [44.9, 395.0], [45.0, 395.0], [45.1, 395.0], [45.2, 395.0], [45.3, 395.0], [45.4, 395.0], [45.5, 395.0], [45.6, 395.0], [45.7, 396.0], [45.8, 396.0], [45.9, 396.0], [46.0, 396.0], [46.1, 396.0], [46.2, 397.0], [46.3, 397.0], [46.4, 397.0], [46.5, 397.0], [46.6, 397.0], [46.7, 398.0], [46.8, 398.0], [46.9, 398.0], [47.0, 398.0], [47.1, 398.0], [47.2, 398.0], [47.3, 399.0], [47.4, 399.0], [47.5, 399.0], [47.6, 400.0], [47.7, 400.0], [47.8, 400.0], [47.9, 400.0], [48.0, 400.0], [48.1, 400.0], [48.2, 401.0], [48.3, 401.0], [48.4, 401.0], [48.5, 401.0], [48.6, 401.0], [48.7, 401.0], [48.8, 401.0], [48.9, 401.0], [49.0, 401.0], [49.1, 402.0], [49.2, 402.0], [49.3, 402.0], [49.4, 402.0], [49.5, 402.0], [49.6, 403.0], [49.7, 403.0], [49.8, 403.0], [49.9, 403.0], [50.0, 403.0], [50.1, 403.0], [50.2, 403.0], [50.3, 404.0], [50.4, 404.0], [50.5, 404.0], [50.6, 404.0], [50.7, 404.0], [50.8, 404.0], [50.9, 404.0], [51.0, 404.0], [51.1, 405.0], [51.2, 405.0], [51.3, 405.0], [51.4, 405.0], [51.5, 405.0], [51.6, 405.0], [51.7, 406.0], [51.8, 406.0], [51.9, 406.0], [52.0, 406.0], [52.1, 406.0], [52.2, 406.0], [52.3, 406.0], [52.4, 406.0], [52.5, 407.0], [52.6, 407.0], [52.7, 407.0], [52.8, 407.0], [52.9, 407.0], [53.0, 408.0], [53.1, 408.0], [53.2, 408.0], [53.3, 408.0], [53.4, 408.0], [53.5, 408.0], [53.6, 408.0], [53.7, 408.0], [53.8, 409.0], [53.9, 409.0], [54.0, 409.0], [54.1, 409.0], [54.2, 409.0], [54.3, 410.0], [54.4, 410.0], [54.5, 410.0], [54.6, 410.0], [54.7, 410.0], [54.8, 410.0], [54.9, 410.0], [55.0, 410.0], [55.1, 410.0], [55.2, 411.0], [55.3, 411.0], [55.4, 411.0], [55.5, 411.0], [55.6, 411.0], [55.7, 411.0], [55.8, 411.0], [55.9, 412.0], [56.0, 412.0], [56.1, 412.0], [56.2, 412.0], [56.3, 412.0], [56.4, 412.0], [56.5, 412.0], [56.6, 413.0], [56.7, 413.0], [56.8, 413.0], [56.9, 413.0], [57.0, 413.0], [57.1, 413.0], [57.2, 414.0], [57.3, 414.0], [57.4, 414.0], [57.5, 414.0], [57.6, 414.0], [57.7, 414.0], [57.8, 414.0], [57.9, 414.0], [58.0, 414.0], [58.1, 415.0], [58.2, 415.0], [58.3, 415.0], [58.4, 415.0], [58.5, 415.0], [58.6, 415.0], [58.7, 416.0], [58.8, 416.0], [58.9, 416.0], [59.0, 416.0], [59.1, 416.0], [59.2, 416.0], [59.3, 416.0], [59.4, 416.0], [59.5, 417.0], [59.6, 417.0], [59.7, 417.0], [59.8, 417.0], [59.9, 417.0], [60.0, 418.0], [60.1, 418.0], [60.2, 418.0], [60.3, 418.0], [60.4, 418.0], [60.5, 418.0], [60.6, 418.0], [60.7, 418.0], [60.8, 418.0], [60.9, 419.0], [61.0, 419.0], [61.1, 419.0], [61.2, 419.0], [61.3, 419.0], [61.4, 419.0], [61.5, 420.0], [61.6, 420.0], [61.7, 420.0], [61.8, 420.0], [61.9, 420.0], [62.0, 420.0], [62.1, 421.0], [62.2, 421.0], [62.3, 421.0], [62.4, 421.0], [62.5, 421.0], [62.6, 421.0], [62.7, 422.0], [62.8, 422.0], [62.9, 422.0], [63.0, 422.0], [63.1, 422.0], [63.2, 423.0], [63.3, 423.0], [63.4, 423.0], [63.5, 423.0], [63.6, 423.0], [63.7, 423.0], [63.8, 424.0], [63.9, 424.0], [64.0, 424.0], [64.1, 425.0], [64.2, 425.0], [64.3, 425.0], [64.4, 425.0], [64.5, 425.0], [64.6, 425.0], [64.7, 425.0], [64.8, 426.0], [64.9, 426.0], [65.0, 426.0], [65.1, 426.0], [65.2, 426.0], [65.3, 427.0], [65.4, 427.0], [65.5, 427.0], [65.6, 427.0], [65.7, 427.0], [65.8, 427.0], [65.9, 428.0], [66.0, 428.0], [66.1, 428.0], [66.2, 428.0], [66.3, 429.0], [66.4, 429.0], [66.5, 429.0], [66.6, 429.0], [66.7, 429.0], [66.8, 430.0], [66.9, 430.0], [67.0, 430.0], [67.1, 430.0], [67.2, 430.0], [67.3, 431.0], [67.4, 431.0], [67.5, 431.0], [67.6, 431.0], [67.7, 431.0], [67.8, 431.0], [67.9, 432.0], [68.0, 432.0], [68.1, 432.0], [68.2, 432.0], [68.3, 433.0], [68.4, 433.0], [68.5, 433.0], [68.6, 434.0], [68.7, 434.0], [68.8, 434.0], [68.9, 434.0], [69.0, 435.0], [69.1, 435.0], [69.2, 435.0], [69.3, 435.0], [69.4, 435.0], [69.5, 436.0], [69.6, 436.0], [69.7, 436.0], [69.8, 437.0], [69.9, 437.0], [70.0, 437.0], [70.1, 438.0], [70.2, 438.0], [70.3, 438.0], [70.4, 439.0], [70.5, 440.0], [70.6, 441.0], [70.7, 441.0], [70.8, 442.0], [70.9, 443.0], [71.0, 444.0], [71.1, 444.0], [71.2, 446.0], [71.3, 448.0], [71.4, 450.0], [71.5, 450.0], [71.6, 452.0], [71.7, 452.0], [71.8, 453.0], [71.9, 458.0], [72.0, 463.0], [72.1, 463.0], [72.2, 467.0], [72.3, 471.0], [72.4, 480.0], [72.5, 483.0], [72.6, 489.0], [72.7, 493.0], [72.8, 494.0], [72.9, 496.0], [73.0, 502.0], [73.1, 506.0], [73.2, 512.0], [73.3, 516.0], [73.4, 516.0], [73.5, 520.0], [73.6, 527.0], [73.7, 528.0], [73.8, 534.0], [73.9, 539.0], [74.0, 541.0], [74.1, 550.0], [74.2, 558.0], [74.3, 560.0], [74.4, 565.0], [74.5, 582.0], [74.6, 598.0], [74.7, 612.0], [74.8, 629.0], [74.9, 646.0], [75.0, 648.0], [75.1, 676.0], [75.2, 696.0], [75.3, 741.0], [75.4, 750.0], [75.5, 772.0], [75.6, 790.0], [75.7, 801.0], [75.8, 829.0], [75.9, 866.0], [76.0, 908.0], [76.1, 1129.0], [76.2, 1154.0], [76.3, 1175.0], [76.4, 1181.0], [76.5, 1199.0], [76.6, 1221.0], [76.7, 1224.0], [76.8, 1244.0], [76.9, 1251.0], [77.0, 1254.0], [77.1, 1256.0], [77.2, 1259.0], [77.3, 1264.0], [77.4, 1266.0], [77.5, 1268.0], [77.6, 1274.0], [77.7, 1274.0], [77.8, 1276.0], [77.9, 1279.0], [78.0, 1280.0], [78.1, 1282.0], [78.2, 1283.0], [78.3, 1285.0], [78.4, 1288.0], [78.5, 1290.0], [78.6, 1293.0], [78.7, 1293.0], [78.8, 1295.0], [78.9, 1300.0], [79.0, 1302.0], [79.1, 1303.0], [79.2, 1306.0], [79.3, 1307.0], [79.4, 1308.0], [79.5, 1310.0], [79.6, 1311.0], [79.7, 1312.0], [79.8, 1312.0], [79.9, 1314.0], [80.0, 1315.0], [80.1, 1316.0], [80.2, 1319.0], [80.3, 1320.0], [80.4, 1324.0], [80.5, 1325.0], [80.6, 1326.0], [80.7, 1327.0], [80.8, 1329.0], [80.9, 1330.0], [81.0, 1332.0], [81.1, 1332.0], [81.2, 1333.0], [81.3, 1334.0], [81.4, 1335.0], [81.5, 1337.0], [81.6, 1339.0], [81.7, 1339.0], [81.8, 1341.0], [81.9, 1342.0], [82.0, 1345.0], [82.1, 1347.0], [82.2, 1348.0], [82.3, 1351.0], [82.4, 1352.0], [82.5, 1352.0], [82.6, 1354.0], [82.7, 1355.0], [82.8, 1356.0], [82.9, 1357.0], [83.0, 1357.0], [83.1, 1358.0], [83.2, 1359.0], [83.3, 1360.0], [83.4, 1360.0], [83.5, 1362.0], [83.6, 1362.0], [83.7, 1364.0], [83.8, 1364.0], [83.9, 1365.0], [84.0, 1366.0], [84.1, 1367.0], [84.2, 1368.0], [84.3, 1371.0], [84.4, 1372.0], [84.5, 1373.0], [84.6, 1374.0], [84.7, 1376.0], [84.8, 1377.0], [84.9, 1377.0], [85.0, 1378.0], [85.1, 1378.0], [85.2, 1380.0], [85.3, 1381.0], [85.4, 1382.0], [85.5, 1384.0], [85.6, 1385.0], [85.7, 1387.0], [85.8, 1387.0], [85.9, 1388.0], [86.0, 1388.0], [86.1, 1389.0], [86.2, 1389.0], [86.3, 1390.0], [86.4, 1390.0], [86.5, 1390.0], [86.6, 1391.0], [86.7, 1391.0], [86.8, 1393.0], [86.9, 1394.0], [87.0, 1394.0], [87.1, 1395.0], [87.2, 1395.0], [87.3, 1395.0], [87.4, 1396.0], [87.5, 1396.0], [87.6, 1398.0], [87.7, 1398.0], [87.8, 1399.0], [87.9, 1399.0], [88.0, 1400.0], [88.1, 1401.0], [88.2, 1403.0], [88.3, 1404.0], [88.4, 1405.0], [88.5, 1407.0], [88.6, 1407.0], [88.7, 1409.0], [88.8, 1410.0], [88.9, 1410.0], [89.0, 1411.0], [89.1, 1411.0], [89.2, 1412.0], [89.3, 1415.0], [89.4, 1415.0], [89.5, 1416.0], [89.6, 1417.0], [89.7, 1417.0], [89.8, 1418.0], [89.9, 1418.0], [90.0, 1419.0], [90.1, 1421.0], [90.2, 1423.0], [90.3, 1423.0], [90.4, 1424.0], [90.5, 1424.0], [90.6, 1427.0], [90.7, 1427.0], [90.8, 1428.0], [90.9, 1429.0], [91.0, 1430.0], [91.1, 1431.0], [91.2, 1432.0], [91.3, 1432.0], [91.4, 1433.0], [91.5, 1433.0], [91.6, 1434.0], [91.7, 1435.0], [91.8, 1438.0], [91.9, 1439.0], [92.0, 1439.0], [92.1, 1442.0], [92.2, 1443.0], [92.3, 1447.0], [92.4, 1447.0], [92.5, 1447.0], [92.6, 1448.0], [92.7, 1449.0], [92.8, 1449.0], [92.9, 1451.0], [93.0, 1452.0], [93.1, 1453.0], [93.2, 1455.0], [93.3, 1457.0], [93.4, 1459.0], [93.5, 1460.0], [93.6, 1461.0], [93.7, 1462.0], [93.8, 1464.0], [93.9, 1464.0], [94.0, 1465.0], [94.1, 1466.0], [94.2, 1469.0], [94.3, 1469.0], [94.4, 1470.0], [94.5, 1473.0], [94.6, 1474.0], [94.7, 1476.0], [94.8, 1478.0], [94.9, 1480.0], [95.0, 1482.0], [95.1, 1485.0], [95.2, 1487.0], [95.3, 1489.0], [95.4, 1493.0], [95.5, 1496.0], [95.6, 1500.0], [95.7, 1501.0], [95.8, 1505.0], [95.9, 1510.0], [96.0, 1517.0], [96.1, 1519.0], [96.2, 1530.0], [96.3, 1544.0], [96.4, 1551.0], [96.5, 1558.0], [96.6, 1563.0], [96.7, 1575.0], [96.8, 1588.0], [96.9, 1617.0], [97.0, 1628.0], [97.1, 1662.0], [97.2, 1679.0], [97.3, 1697.0], [97.4, 1702.0], [97.5, 1748.0], [97.6, 1788.0], [97.7, 1805.0], [97.8, 1824.0], [97.9, 1857.0], [98.0, 1866.0], [98.1, 1897.0], [98.2, 1918.0], [98.3, 1943.0], [98.4, 1979.0], [98.5, 2034.0], [98.6, 2355.0], [98.7, 2372.0], [98.8, 2394.0], [98.9, 2415.0], [99.0, 2456.0], [99.1, 2519.0], [99.2, 2641.0], [99.3, 2673.0], [99.4, 2774.0], [99.5, 2939.0], [99.6, 3014.0], [99.7, 3192.0], [99.8, 3462.0], [99.9, 3999.0], [100.0, 5762.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 1969.0, "series": [{"data": [[0.0, 1969.0], [4500.0, 1.0], [2500.0, 12.0], [5500.0, 1.0], [1500.0, 78.0], [3000.0, 8.0], [3500.0, 3.0], [1000.0, 528.0], [2000.0, 17.0], [500.0, 83.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 5500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 117.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1970.0, "series": [{"data": [[1.0, 613.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1970.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 117.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 2.903418803418803, "minX": 1.60387512E12, "maxY": 3.0, "series": [{"data": [[1.60387524E12, 3.0], [1.60387512E12, 3.0], [1.6038753E12, 2.903418803418803], [1.60387518E12, 3.0]], "isOverall": false, "label": "线程组", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038753E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 154.3529411764706, "minX": 1.0, "maxY": 586.9866310160419, "series": [{"data": [[2.0, 154.3529411764706], [1.0, 306.4516129032258], [3.0, 586.9866310160419]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[2.9581481481481444, 575.5937037037021]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 3.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 432.9, "minX": 1.60387512E12, "maxY": 49723.8, "series": [{"data": [[1.60387524E12, 25635.866666666665], [1.60387512E12, 9238.9], [1.6038753E12, 49723.8], [1.60387518E12, 28798.733333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.60387524E12, 1201.2], [1.60387512E12, 432.9], [1.6038753E12, 2281.5], [1.60387518E12, 1349.4]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038753E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 253.820512820513, "minX": 1.60387512E12, "maxY": 875.2905844155844, "series": [{"data": [[1.60387524E12, 875.2905844155844], [1.60387512E12, 786.9549549549542], [1.6038753E12, 253.820512820513], [1.60387518E12, 785.043352601156]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038753E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 253.79487179487165, "minX": 1.60387512E12, "maxY": 875.2564935064934, "series": [{"data": [[1.60387524E12, 875.2564935064934], [1.60387512E12, 786.9009009009005], [1.6038753E12, 253.79487179487165], [1.60387518E12, 784.9913294797682]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038753E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 84.75641025641022, "minX": 1.60387512E12, "maxY": 415.1266233766232, "series": [{"data": [[1.60387524E12, 415.1266233766232], [1.60387512E12, 385.26126126126115], [1.6038753E12, 84.75641025641022], [1.60387518E12, 365.7442196531796]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038753E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 42.0, "minX": 1.60387512E12, "maxY": 5762.0, "series": [{"data": [[1.60387524E12, 3623.0], [1.60387512E12, 5762.0], [1.6038753E12, 2519.0], [1.60387518E12, 4637.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.60387524E12, 348.0], [1.60387512E12, 346.0], [1.6038753E12, 42.0], [1.60387518E12, 348.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.60387524E12, 1465.0], [1.60387512E12, 1417.7], [1.6038753E12, 1419.0], [1.60387518E12, 1428.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.60387524E12, 2816.0], [1.60387512E12, 2875.9800000000027], [1.6038753E12, 2440.839999999992], [1.60387518E12, 2676.4799999999996]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.60387524E12, 1665.5], [1.60387512E12, 1445.1999999999998], [1.6038753E12, 1483.7999999999997], [1.60387518E12, 1493.35]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038753E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 104.0, "minX": 3.0, "maxY": 433.0, "series": [{"data": [[19.0, 104.0], [10.0, 433.0], [11.0, 420.0], [3.0, 417.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 19.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 104.0, "minX": 3.0, "maxY": 433.0, "series": [{"data": [[19.0, 104.0], [10.0, 433.0], [11.0, 420.0], [3.0, 417.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 19.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.85, "minX": 1.60387512E12, "maxY": 19.35, "series": [{"data": [[1.60387524E12, 10.266666666666667], [1.60387512E12, 3.85], [1.6038753E12, 19.35], [1.60387518E12, 11.533333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038753E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.7, "minX": 1.60387512E12, "maxY": 19.5, "series": [{"data": [[1.60387524E12, 10.266666666666667], [1.60387512E12, 3.7], [1.6038753E12, 19.5], [1.60387518E12, 11.533333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.6038753E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.7, "minX": 1.60387512E12, "maxY": 19.5, "series": [{"data": [[1.60387524E12, 10.266666666666667], [1.60387512E12, 3.7], [1.6038753E12, 19.5], [1.60387518E12, 11.533333333333333]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.6038753E12, "title": "Transactions Per Second"}},
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

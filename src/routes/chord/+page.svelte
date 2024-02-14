<script>
  import { onMount } from "svelte";


onMount(() => {
    /*** Define parameters and tools ***/
var width = 760,
    height = 820,
    outerRadius = Math.min(width, height) / 2 - 120,//100,
    innerRadius = outerRadius - 10;

var dataset = [
  [3043905,1376846,77883,54676,1437528,3228,114863,477,10042,3406,1070,426,6227,108308,65243,27417,29445,5778,542207,846492,5386],
  [256977,15208910,628066,41646,453516,121805,417559,119457,226843,15999,134961,1025,8472,30179,18190,76181,133528,6568,135890,396902,5682],
  [332794,4765429,172067,10321,487659,8097,720294,1507,75954,19072,992,18,843,12246,44651,133544,48151,2535,91966,265602,147],
  [239601,222011,3771,149202,388973,1567,13067,176,1708,1181,1966,59,0,664,241,346,11767,1123,114308,628334,15836],
  [215523,275788,6243,51001,40603,90,15206,2253,6494,7327,20646,2992,0,1509,2238,11246,17034,1766,349561,616112,102378],
  [476,73531,73,246,63811,27680,271,124,0,0,1,0,0,0,9,2,81,0,24,7,0],
  [17393,147675,9090,1041,91652,517,151324,0,97,11,0,0,0,3116,99,868,2492,1,79098,130148,1],
  [24791,877967,15578,2667,81667,3123,10846,2547,63252,43332,5652,56,0,4969,1221,6219,48724,25,3433,2947,1084],
  [102889,487961,875,29,95413,181,4733,6909,43945,9145,1726,255,57,2415,235,2770,2303,2497,5039,11121,2038],
  [2,18112,0,0,2,0,0,13,2,404,0,0,0,0,0,0,0,0,80,1874,0],
  [13276,734855,10631,9576,80923,37,646,165,3121,2919,34104,2876,55,689,1381,914,24296,2292,19119,20354,3037],
  [5657,244031,1022,5120,83398,174,434,242,4801,29401,21074,1217,8,211,79,2450,2780,113,3188,3913,431],
  [4143,330219,6183,0,1856,0,0,0,0,0,0,0,0,0,0,0,0,0,372,499,0],
  [1088685,194271,2621,309,50750,0,225,563,26,0,0,0,0,73717,15110,13275,2351,73,17875,75448,0],
  [76984,100783,0,599,16260,0,0,0,0,0,0,1,2,325,5492,1257,474,0,333,2014,2],
  [1640995,2368047,32711,40029,1109867,13374,103164,13688,56494,19776,2883,1000,0,69867,59080,502752,50985,35162,286969,944923,10038],
  [35512,222056,2172,3133,67557,602,2336,5029,1240,95,2861,5,0,5350,218,229,177430,9493,57834,76016,542],
  [536907,761250,4621,24342,370992,347,4899,7864,3543,439,6147,649,15925,1565,3702,30804,111934,41182,211025,236733,524],
  [3495747,1604107,58589,420782,3379881,9629,106641,8327,13917,7633,9135,1394,349,41680,24280,32195,290835,32832,1173357,960551,37905],
  [1729045,1084850,8788,105699,3751744,1584,148057,1244,1343,750,5154,197,496,165068,17746,5723,33255,4088,1627476,726009,52198],
  [30525,42654,3,11773,36719,0,116,0,19,0,0,0,0,92,32,769,36,163,16999,17725,30798]
];
var regions = [
    {name: "N. America Developed", color: "rgba(255, 0, 255, 0.5)"},
    {name: "European U. (27)", color: "rgba(0, 0, 255, 0.5)"},
    {name: "Western Europe", color: "rgba(100, 149, 237, 0.5)"},
    {name: "Oceania Developed", color: "rgba(244, 164, 96, 0.5)"},
    {name: "Other Developed", color: "rgba(142, 142, 56, 0.5)"},
    {name: "Eastern Europe", color: "rgba(198, 226, 255, 0.5)"},
    {name: "Econ. in Transition", color: "rgba(216, 191, 216, 0.5)"},
    {name: "N.W. Africa", color: "rgba(151, 255, 255, 0.5)"},
    {name: "Western Africa", color: "rgba(0, 238, 238, 0.5)"},
    {name: "Central Africa", color: "rgba(3, 168, 158, 0.5)"},
    {name: "Eastern Africa", color: "rgba(102, 205, 170, 0.5)"},
    {name: "Southern Africa", color: "rgba(0, 255, 127, 0.5)"},
    {name: "N. America Developing", color: "rgba(128, 0, 128, 0.5)"},
    {name: "Central America", color: "rgba(191, 62, 255, 0.5)"},
    {name: "Caribbean", color: "rgba(145, 44, 238, 0.5)"},
    {name: "South America", color: "rgba(238, 130, 238, 0.5)"},
    {name: "Near East", color: "rgba(255, 255, 0, 0.5)"},
    {name: "Southern Asia", color: "rgba(255, 114, 86, 0.5)"},
    {name: "E. and S.E. Asia", color: "rgba(255, 127, 36, 0.5)"},
    {name: "China", color: "rgba(255, 48, 48, 0.5)"},
    {name: "Oceania Developing", color: "rgba(255, 69, 0, 0.5)"}
];
//string url for the initial data set
//would usually be a file path url, here it is the id
//selector for the <pre> element storing the data

//create number formatting functions
var formatPercent = d3.format("%");
var numberWithCommas = d3.format("0,f");

//create the arc path data generator for the groups
var arc = d3.svg.arc()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);

//create the chord path data generator for the chords
var path = d3.svg.chord()
    .radius(innerRadius - 1);// subtracted 4 to separate the ribbon

//define the default chord layout parameters
//within a function that returns a new layout object;
//that way, you can create multiple chord layouts
//that are the same except for the data.
function getDefaultLayout() {
    return d3.layout.chord()
    .padding(0.03)
    .sortSubgroups(d3.descending)
    .sortChords(d3.ascending);
}  
var last_layout; //store layout between updates


/*** Initialize the visualization ***/
var g = d3.select("#chart_placeholder").append("svg")
        .attr("width", width)
        .attr("height", height)
    .append("g")
        .attr("id", "circle")
        .attr("transform", 
              "translate(" + width / 2 + "," + height / 2 + ")");
//the entire graphic will be drawn within this <g> element,
//so all coordinates will be relative to the center of the circle

/* Create OR update a chord layout from a data matrix */
function updateChords( matrix ) {
    /* Compute chord layout. */
    let layout = getDefaultLayout(); //create a new layout object
    layout.matrix(matrix);
 
    /* Create/update "group" elements */
    var groupG = g.selectAll("g.group")
        .data(layout.groups(), function (d) {
            return d.index; 
            //use a key function in case the 
            //groups are sorted differently 
        });
    
    groupG.exit()
        .transition()
            .duration(1500)
            .attr("opacity", 0)
            .remove(); //remove after transitions are complete
    
    var newGroups = groupG.enter().append("g")
        .attr("class", "group");
    //the enter selection is stored in a variable so we can
    //enter the <path>, <text>, and <title> elements as well

    
    //Create the title tooltip for the new groups
    newGroups.append("title");
    
    //Update the (tooltip) title text based on the data
    groupG.select("title")
        .text(function(d, i) {
            return numberWithCommas(d.value) 
                + " x (10\u00B3) in USD exports from " 
                + regions[i].name;
        });

    //create the arc paths and set the constant attributes
    //(those based on the group index, not on the value)
    newGroups.append("path")
        .attr("id", function (d) {
            return "group" + d.index;
            //using d.index and not i to maintain consistency
            //even if groups are sorted
        })
        .style("fill", function (d) {
            return regions[d.index].color;
        });
    
    //update the paths to match the layout
    groupG.select("path") 
        .transition()
            .duration(200)
            //.attr("opacity", 0.5) //optional, just to observe the transition////////////
        .attrTween("d", arcTween( last_layout ))
           // .transition().duration(100).attr("opacity", 1) //reset opacity//////////////
        ;
    
    //create the group labels
    newGroups.append("svg:text")
        .attr("xlink:href", function (d) {
            return "#group" + d.index;
        })
        .attr("dy", ".35em")
        .attr("color", "#fff")
        .text(function (d) {
            return regions[d.index].name; 
        });

    //position group labels to match layout
    groupG.select("text")
        .transition()
            .duration(200)
            .attr("transform", function(d) {
                d.angle = (d.startAngle + d.endAngle) / 2;
                //store the midpoint angle in the data object
                
                return "rotate(" + (d.angle * 180 / Math.PI - 90) + ")" +
                    " translate(" + (innerRadius + 26) + ")" + 
                    (d.angle > Math.PI ? " rotate(180)" : " rotate(0)"); 
                //include the rotate zero so that transforms can be interpolated
            })
            .attr("text-anchor", function (d) {
                return d.angle > Math.PI ? "end" : "begin";
            });
    
    
    /* Create/update the chord paths */
    var chordPaths = g.selectAll("path.chord")
        .data(layout.chords(), chordKey );
            //specify a key function to match chords
            //between updates
        
    
    //create the new chord paths
    var newChords = chordPaths.enter()
        .append("path")
        .attr("class", "chord");
    
    // Add title tooltip for each new chord.
    newChords.append("title");
    
    // Update all chord title texts
    chordPaths.select("title")
        .text(function(d) {
            if (regions[d.target.index].name !== regions[d.source.index].name) {
                return [numberWithCommas(d.source.value),
                        " exports from ",
                        regions[d.source.index].name,
                        " to ",
                        regions[d.target.index].name,
                        "\n",
                        numberWithCommas(d.target.value),
                        " exports from ",
                        regions[d.target.index].name,
                        " to ",
                        regions[d.source.index].name
                        ].join(""); 
                    //joining an array of many strings is faster than
                    //repeated calls to the '+' operator, 
                    //and makes for neater code!
            } 
            else { //source and target are the same
                return numberWithCommas(d.source.value) 
                    + " exports ended in " 
                    + regions[d.source.index].name;
            }
        });

    //handle exiting paths:
    chordPaths.exit()
    .transition()
        .duration(200)
        .attr("opacity", 0)
        .remove();

    //update the path shape
    chordPaths
    .transition()
        .duration(200)
        //.attr("opacity", 0.5) //optional, just to observe the transition
        .style("fill", function (d) {
            return regions[d.source.index].color;
        })
        .attrTween("d", chordTween(last_layout))
        .transition().duration(100).attr("opacity", 1) //reset opacity
    ;

    //add the mouseover/fade out behaviour to the groups
    //this is reset on every update, so it will use the latest
    //chordPaths selection
    groupG.on("mouseover", function(d) {
        highlightChords(d);
    });

    chordPaths.on("mouseover", function(d) {
        highlightChords(d.source);
    });

    function highlightChords(d) {
        chordPaths.classed("fade", function (p) {
            //returns true if *neither* the source or target of the chord
            //matches the group that has been moused-over
            return ((p.source.index != d.index) && (p.target.index != d.index));
        });
    }
    //the "unfade" is handled with CSS :hover class on g#circle
    //you could also do it using a mouseout event:
    g.on("mouseout", function() {
        if (this == g.node() )
            //only respond to mouseout of the entire circle
            //not mouseout events for sub-components
            chordPaths.classed("fade", false);
    });
    
    last_layout = layout; //save for next update
}

function arcTween(oldLayout) {
    //this function will be called once per update cycle
    
    //Create a key:value version of the old layout's groups array
    //so we can easily find the matching group 
    //even if the group index values don't match the array index
    //(because of sorting)
    var oldGroups = {};
    if (oldLayout) {
        oldLayout.groups().forEach( function(groupData) {
            oldGroups[ groupData.index ] = groupData;
        });
    }
    
    return function (d, i) {
        var tween;
        var old = oldGroups[d.index];
        if (old) { //there's a matching old group
            tween = d3.interpolate(old, d);
        }
        else {
            //create a zero-width arc object
            var emptyArc = {startAngle:d.startAngle,
                            endAngle:d.startAngle};
            tween = d3.interpolate(emptyArc, d);
        }
        
        return function (t) {
            return arc( tween(t) );
        };
    };
}

function chordKey(data) {
    return (data.source.index < data.target.index) ?
        data.source.index  + "-" + data.target.index:
        data.target.index  + "-" + data.source.index;
    
    //create a key that will represent the relationship
    //between these two groups *regardless*
    //of which group is called 'source' and which 'target'
}
function chordTween(oldLayout) {
    //this function will be called once per update cycle
    
    //Create a key:value version of the old layout's chords array
    //so we can easily find the matching chord 
    //(which may not have a matching index)
    
    var oldChords = {};
    
    if (oldLayout) {
        oldLayout.chords().forEach( function(chordData) {
            oldChords[ chordKey(chordData) ] = chordData;
        });
    }
    
    return function (d, i) {
        //this function will be called for each active chord
        
        var tween;
        var old = oldChords[ chordKey(d) ];
        if (old) {
            //old is not undefined, i.e.
            //there is a matching old chord value
            
            //check whether source and target have been switched:
            if (d.source.index != old.source.index ){
                //swap source and target to match the new data
                old = {
                    source: old.target,
                    target: old.source
                };
            }
            
            tween = d3.interpolate(old, d);
        }
        else {
            //create a zero-width chord object
///////////////////////////////////////////////////////////in the copy ////////////////            
            if (oldLayout) {
                var oldGroups = oldLayout.groups().filter(function(group) {
                        return ( (group.index == d.source.index) ||
                                 (group.index == d.target.index) )
                    });
                old = {source:oldGroups[0],
                           target:oldGroups[1] || oldGroups[0] };
                    //the OR in target is in case source and target are equal
                    //in the data, in which case only one group will pass the
                    //filter function
                
                if (d.source.index != old.source.index ){
                    //swap source and target to match the new data
                    old = {
                        source: old.target,
                        target: old.source
                    };
                }
            }
            else old = d;
 /////////////////////////////////////////////////////////////////               
            var emptyChord = {
                source: { startAngle: old.source.startAngle,
                         endAngle: old.source.startAngle},
                target: { startAngle: old.target.startAngle,
                         endAngle: old.target.startAngle}
            };
            tween = d3.interpolate( emptyChord, d );
        }

        return function (t) {
            //this function calculates the intermediary shapes
            return path(tween(t));
        };
    };
}

updateChords(dataset); 


})
    
</script>
<svelte:head>
    <script src="https://code.jquery.com/jquery-3.2.1.min.js"></script>
    <script src="https://d3js.org/d3.v3.js"></script>
</svelte:head>
<div id="chart_placeholder"></div>
<style>
circle {
    fill: red!important;
    pointer-events: all;
}
body {
    background: white;
    width:1150px;
}
#chart_placeholder {
    width: 750px;
    height: 830px;
}
path.chord {
    stroke: #000;
    stroke-width: .10px;
    transition: opacity 0.3s;
}
 #circle:hover path.fade {
    opacity: 0;
}

/*text is regions name only on chord diagram and scroll text*/
text {
    fill: black;
    font-family: Arial Narrow,Arial,sans-serif;
    text-align: center;
    font-size: 14px;
}
svg {
    font-size: 10px;
    color: green;
    min-height: 100%;
    min-width: 100%;
}

.yearbuttons{/*area*/
    float: left;
    margin-right: 50px;
    width: 400px;
}
.current{
    background-color: white;
    color: black;
    font-size : 16px;
    font-family: Arial Narrow,Arial,sans-serif;
    border-color: black;
    border-radius: 2em;
}
</style>
<script lang="ts">
  import { onMount } from "svelte";


onMount(() => {
let xxl = ["240,248,255",
"250,235,215",
"0,255,255",
"127,255,212",
"240,255,255",
"245,245,220",
"255,228,196",
"0,0,0",
"255,235,205",
"0,0,255",
"138,43,226",
"165,42,42",
"222,184,135",
"95,158,160",
"127,255,0",
"210,105,30",
"255,127,80",
"100,149,237",
"255,248,220",
"220,20,60",
"0,255,255",
"0,0,139",
"0,139,139",
"184,134,11",
"169,169,169",
"0,100,0",
"189,183,107",
"139,0,139",
"85,107,47",
"255,140,0",
"153,50,204",
"139,0,0",
"233,150,122",
"143,188,143",
"72,61,139",
"47,79,79",
"0,206,209",
"148,0,211",
"255,20,147",
"0,191,255",
"105,105,105",
"30,144,255",
"178,34,34",
"255,250,240",
"34,139,34",
"255,0,255",
"220,220,220",
"248,248,255",
"255,215,0",
"218,165,32",
"128,128,128",
"0,128,0",
"173,255,47",
"240,255,240",
"255,105,180",
"205,92,92",
"75,0,130",
"255,255,240",
"240,230,140",
"230,230,250",
"255,240,245",
"124,252,0",
"255,250,205",
"173,216,230",
"240,128,128",
"224,255,255",
"250,250,210",
"144,238,144",
"211,211,211",
"255,182,193",
"255,160,122",
"32,178,170",
"135,206,250",
"119,136,153",
"176,196,222",
"255,255,224",
"0,255,0",
"50,205,50",
"250,240,230",
"255,0,255",
"128,0,0",
"102,205,170",
"0,0,205",
"186,85,211",
"147,112,219",
"60,179,113",
"123,104,238",
"0,250,154",
"72,209,204",
"199,21,133",
"25,25,112",
"245,255,250",
"255,228,225",
"255,228,181",
"255,222,173",
"0,0,128",
"253,245,230",
"128,128,0",
"107,142,35",
"255,165,0",
"255,69,0",
"218,112,214",
"238,232,170",
"152,251,152",
"175,238,238",
"219,112,147",
"255,239,213",
"255,218,185",
"205,133,63",
"255,192,203",
"221,160,221",
"176,224,230",
"128,0,128",
"255,0,0",
"188,143,143",
"65,105,225",
"139,69,19",
"250,128,114",
"244,164,96",
"46,139,87",
"255,245,238",
"160,82,45",
"192,192,192",
"135,206,235",
"106,90,205",
"112,128,144",
"255,250,250",
"0,255,127",
"70,130,180",
"210,180,140",
"0,128,128",
"216,191,216",
"255,99,71",
"64,224,208",
"238,130,238",
"245,222,179",
"255,255,255",
"245,245,245",
"255,255,0",
"154,205,50"];

function sortColors(colors: string[]): [string[], string[], string[], string[]] {
    let reds: string[] = [], greens: string[] = [], blues: string[] = [], neutrals: string[] = [];

    for (let color of colors) {
        let [r, g, b] = color.split(',').map(Number);

        if (r >= g && r > b) {
            reds.push(color);
        } else if (g > r && g > b) {
            greens.push(color);
        } else if (b > r && b >= g) {
            blues.push(color);
        } else {
            neutrals.push(color);
        }
    }

    return [reds, greens, blues, neutrals]
}
function convertToRGB(colors: string[]): string[] {
    return colors.map(color => {
        let [r, g, b] = color.split(',');
        return `rgb(${r}, ${g}, ${b})`;
    });
}
let _reds = ['250,235,215', '245,245,220', '255,228,196', '255,235,205', '165,42,42', '222,184,135', '210,105,30', '255,127,80', '255,248,220', '220,20,60', '184,134,11', '189,183,107', '255,140,0', '139,0,0', '233,150,122', '255,20,147', '178,34,34', '255,250,240', '255,215,0', '218,165,32', '255,105,180', '205,92,92', '255,255,240', '240,230,140', '255,240,245', '255,250,205', '240,128,128', '250,250,210', '255,182,193', '255,160,122', '255,255,224', '250,240,230', '128,0,0', '199,21,133', '255,228,225', '255,228,181', '255,222,173', '253,245,230', '128,128,0', '255,165,0', '255,69,0', '218,112,214', '238,232,170', '219,112,147', '255,239,213', '255,218,185', '205,133,63', '255,192,203', '255,0,0', '188,143,143', '139,69,19', '250,128,114', '244,164,96', '255,245,238', '160,82,45', '255,250,250', '210,180,140', '255,99,71', '245,222,179', '255,255,0'];
let _greens = ['127,255,212', '127,255,0', '0,100,0', '85,107,47', '143,188,143', '34,139,34', '0,128,0', '173,255,47', '240,255,240', '124,252,0', '144,238,144', '32,178,170', '0,255,0', '50,205,50', '102,205,170', '60,179,113', '0,250,154', '72,209,204', '245,255,250', '107,142,35', '152,251,152', '46,139,87', '0,255,127', '64,224,208', '154,205,50'];
let _blues = ['240,248,255', '0,255,255', '240,255,255', '0,0,255', '138,43,226', '95,158,160', '100,149,237', '0,255,255', '0,0,139', '0,139,139', '153,50,204', '72,61,139', '47,79,79', '0,206,209', '148,0,211', '0,191,255', '30,144,255', '248,248,255', '75,0,130', '230,230,250', '173,216,230', '224,255,255', '135,206,250', '119,136,153', '176,196,222', '0,0,205', '186,85,211', '147,112,219', '123,104,238', '25,25,112', '0,0,128', '175,238,238', '176,224,230', '65,105,225', '135,206,235', '106,90,205', '112,128,144', '70,130,180', '0,128,128'];
let _neutrals = ['0,0,0', '169,169,169', '139,0,139', '105,105,105', '255,0,255', '220,220,220', '128,128,128', '211,211,211', '255,0,255', '221,160,221', '128,0,128', '192,192,192', '216,191,216', '238,130,238', '255,255,255', '245,245,245'];

let [reds, greens, blues, neutrals] = sortColors(xxl);
// print each
console.log(reds);
console.log(greens);
console.log(blues);
console.log(neutrals);
function darkenColor(color: string, percentage: number): string {
    let rgbValues = color.match(/\d+/g);
    if (!rgbValues) {
        throw new Error('Invalid color format');
    }

    let [r, g, b] = rgbValues.map(Number);

    r = Math.floor(r * (1 - percentage / 100));
    g = Math.floor(g * (1 - percentage / 100));
    b = Math.floor(b * (1 - percentage / 100));

    return `rgb(${r}, ${g}, ${b})`;
}

function generateColors(n: number) {
    let colors = [];
    let colorScale = d3.scaleSequential().domain([0, n]).interpolator(d3.interpolateRgbBasisClosed(convertToRGB([..._reds, ..._blues])));
    for (let i = 0; i < n; i++) {
        colors.push(colorScale(i));
    }
    return colors;
}
// interpolateViridis
var matrix = [
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
// let colors: string[] = generateColors(matrix.length, "rgba(200, 0, 0, 0.5)", "rgba(255, 155, 0, 0.5)");
let colors: string[] = generateColors(21);
var labels = [
    "N. America Developed",
    "European U. (27)",
    "Western Europe",
    "Oceania Developed",
    "Other Developed",
    "Eastern Europe",
    "Econ. in Transition",
    "N.W. Africa",
    "Western Africa",
    "Central Africa",
    "Eastern Africa",
    "Southern Africa",
    "N. America Developing",
    "Central America",
    "Caribbean",
    "South America",
    "Near East",
    "Southern Asia",
    "E. and S.E. Asia",
    "China",
    "Oceania Developing"
];


// create the svg area
const svg = d3.select("#my_dataviz")
  .append("svg")
    .classed("svg-content-responsive", true)
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", "0 0 600 600")
  .append("g")
    .attr("transform", "translate(300,300)")
    .classed("rect", true)
   .attr("width", 440)
   .attr("height", 440);

// give this matrix to d3.chord(): it will calculates all the info we need to draw arc and ribbon
const res = d3.chordDirected()
    .padAngle(0.01)     // padding between entities (black arc)
    .sortSubgroups(d3.ascending)
      .sortChords(d3.descending)
    (matrix)

// add the groups on the inner part of the circle
svg
  .datum(res)
  .append("g")
  .classed("rect", true)
   .attr("width", 440)
   .attr("height", 440)
  .selectAll("g")
  .data(d => d.groups)
  .join("g")
  .append("path")
  .style("fill", (d,i) => colors[i])
    .style("stroke", "#222")
    .style("stroke-width", "0.25px")
    .attr("d", d3.arc()
      .innerRadius(210)
      .outerRadius(220)
    )

// Add the links between groups
let paths = svg
  .datum(res)
  .append("g")
  .selectAll("path")
  .data(d => d)
  .join("path")
    .attr("d", d3.ribbonArrow()
      .radius(208)
    )
    .attr("fill-opacity", 0.75)
    .attr("stroke-opacity", 0.5)
    // .style("mix-blend-mode", "multiply")
    .style("fill", d => colors[d.source.index])
    .style("stroke",d => darkenColor(colors[d.source.index], 25))
    .style("stroke-width", "0.5px");

let groups = svg
  .datum(res)
  .append("g")
  .selectAll("g")
  .data(d => d.groups)
  .join("g");

groups.append("path")
  .style("fill", (d,i) => colors[i])
  .style("stroke", "#222")
  .style("stroke-width", "0.25px")
  .attr("d", d3.arc()
    .innerRadius(210)
    .outerRadius(220)
  );

  groups.append("text")
  .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
  .attr("dy", ".35em")
  .attr("transform", d => `
    rotate(${(d.angle * 180 / Math.PI - 90)})
    translate(${220 + 1})
    ${d.angle > Math.PI ? "rotate(180)" : ""}
  `)
  .attr("text-anchor", d => d.angle > Math.PI ? "end" : null)
  .style("font-size", "9px")  // Adjust the font size here
  .text((d, i) => labels[i]);


// Add mouseover and mouseout events to the groups
groups.on("mouseover", function(event, d) {
    // Get the index of the current group
    let currentIndex = d.index;

    // Add the 'd-none' class to the paths not for the current group
    paths.classed("d-none", p => p.source.index !== currentIndex && p.target.index !== currentIndex);
})
.on("mouseout", function(event, d) {
    // Remove the 'd-none' class from all paths
    paths.classed("d-none", false);
});

})
    
</script>
<svelte:head>
    <script src="https://d3js.org/d3.v6.js"></script>
</svelte:head>
<div class="container bg-light border">
    <div id="my_dataviz"></div>
    <!-- <div id="chartId"></div> -->
</div>
<style>
.svg-container {
  display: inline-block;
  position: relative;
  width: 100%;
  padding-bottom: 100%; /* aspect ratio */
  vertical-align: top;
  overflow: hidden;
}
.svg-content-responsive {
  display: inline-block;
  position: absolute;
  top: 10px;
  left: 0;
}
svg .rect {
  fill: gold;
  stroke: steelblue;
  stroke-width: 5px;
}
</style>
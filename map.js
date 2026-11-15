
 // Import Mapbox as an ESM module
 import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

 import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);
console.log('D3 Loaded:', typeof d3.json);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoibm50MDAzIiwiYSI6ImNtd2cwczR0dTA2ZTQyeXBzOHNvdzdseTcifQ.WdIh0lbM0xbl097svncULw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});


function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}


function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}


function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}


function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips
    : trips.filter((trip) => {
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}


console.log('8:30 AM:', minutesSinceMidnight(new Date(2024, 2, 15, 8, 30)));
console.log('5:00 PM:', minutesSinceMidnight(new Date(2024, 2, 15, 17, 0)));



function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    const id = station.short_name;

    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;

    return station;
  });
}



console.log('Test 1:', formatTime(510));
console.log('Test 2:', formatTime(1020));
console.log('Test 3:', formatTime(720));



map.on('load', async () => {
  console.log('Map is fully loaded!');

    const svg = d3.select('#map').select('svg');

    console.log('SVG found:', !svg.empty());


  // Step 1: Load Boston bike lane data
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  // Step 2: Draw Boston bike lanes
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  });

  // Step 3: Add Cambridge bike lane data
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  // Step 4: Display Cambridge bike lanes
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  });

  console.log('Bike lane layers added!');

  // Step 5: Fetch Bluebikes station data
  let jsonData;

  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

    jsonData = await d3.json(jsonurl);

    console.log('Loaded JSON Data:', jsonData);

    let stations = jsonData.data.stations;

    console.log('Stations Array:', stations);
    console.log('First station coordinates:', getCoords(stations[0]));


    // Load Bluebikes traffic data
    const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';


    const trips = await d3.csv(trafficUrl, (trip) => {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);

    return trip;
    });

    console.log('Trips loaded:', trips.length);
    console.log('First trip:', trips[0]);

    console.log('Start is Date:', trips[0].started_at instanceof Date);
    console.log('End is Date:', trips[0].ended_at instanceof Date);


    stations = computeStationTraffic(stations, trips);

    console.log('Updated Stations:', stations);



    const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25])


    const stationFlow = d3
    .scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]);

    console.log('More arrivals:', stationFlow(0.1));
    console.log('Balanced:', stationFlow(0.5));
    console.log('More departures:', stationFlow(0.9));

    console.log('Maximum traffic:', d3.max(stations, (d) => d.totalTraffic));
    console.log('Radius for 100 trips:', radiusScale(100));

    // Create one circle for each bike station
    const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('stroke-width', 1)
    .style('--departure-ratio', (d) =>
        stationFlow(d.totalTraffic > 0 ? d.departures / d.totalTraffic : 0.5)
    );



    const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'station-tooltip');

    circles
    .on('pointerenter pointermove', (event, d) => {
        tooltip
        .style('display', 'block')
        .style('left', `${event.clientX + 15}px`)
        .style('top', `${event.clientY + 15}px`)
        .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    })
    .on('pointerleave', () => {
        tooltip.style('display', 'none');
    });

    console.log('Tooltips created:', circles.selectAll('title').size());


 // Update the circle positions on the map
 function updatePositions() {
   circles
     .attr('cx', (d) => getCoords(d).cx)
     .attr('cy', (d) => getCoords(d).cy);
 }

 // Set the initial positions
 updatePositions();

 // Reposition markers when the map changes
 map.on('move', updatePositions);
 map.on('zoom', updatePositions);
 map.on('resize', updatePositions);
 map.on('moveend', updatePositions);

console.log('Circles created:', circles.size());


function updateScatterPlot(timeFilter) {
  // Step 1: Get trips matching the selected time
  const filteredTrips = filterTripsbyTime(trips, timeFilter);

  // Step 2: Recalculate station traffic
  const filteredStations = computeStationTraffic(
    stations,
    filteredTrips
  );

// NEW: Adjust circle sizes based on the time filter
  timeFilter === -1
    ? radiusScale.range([0, 25])
    : radiusScale.range([3, 50]);

  // Step 3: Update circle sizes
  circles
    .data(filteredStations, (d) => d.short_name)
    .join('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .style('--departure-ratio', (d) =>
    stationFlow(d.totalTraffic > 0 ? d.departures / d.totalTraffic : 0.5)
);

}

timeSlider.addEventListener('input', () => {
  const selectedMinutes = Number(timeSlider.value);
  updateScatterPlot(selectedMinutes);
});


  } catch (error) {
    console.error('Error loading JSON:', error);
  }

});

 // Select the time slider and labels
 const timeSlider = document.getElementById('time-slider');
 const selectedTime = document.getElementById('selected-time');
 const anyTimeLabel = document.getElementById('any-time');

 // Initially, no time filter is applied
 let timeFilter = -1;

 console.log('Time slider found:', timeSlider !== null);
 console.log('Selected time found:', selectedTime !== null);
 console.log('Any time label found:', anyTimeLabel !== null);


function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);

  console.log('Slider value:', timeFilter);


  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }

}

// Update when the user moves the slider
timeSlider.addEventListener('input', updateTimeDisplay);

// Set the initial display
updateTimeDisplay();

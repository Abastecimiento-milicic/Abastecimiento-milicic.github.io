document.addEventListener('DOMContentLoaded', () => {
  const trace1 = {
    x: ['Ene','Feb','Mar','Abr','May'],
    y: [60,70,65,80,75],
    type: 'scatter',
    mode: 'lines+markers',
    name: '% AT'
  };

  const trace2 = {
    x: ['Ene','Feb','Mar','Abr','May'],
    y: [25,20,22,15,18],
    type: 'scatter',
    mode: 'lines+markers',
    name: '% FT'
  };

  const trace3 = {
    x: ['Ene','Feb','Mar','Abr','May'],
    y: [15,10,13,5,7],
    type: 'scatter',
    mode: 'lines+markers',
    name: '% NE'
  };

  Plotly.newPlot('chartMes', [trace1, trace2, trace3], {
    barmode: 'stack',
    title: 'Cumplimiento por mes',
    yaxis: {title: '%'}
  });

  Plotly.newPlot('chartTendencia', [trace1, trace2, trace3], {
    title: 'Tendencia de cumplimiento',
    yaxis: {title: '%'}
  });
});

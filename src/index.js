console.log('Index Script Loaded');

window.Webflow ||= [];
window.Webflow.push(() => {
  console.log('Webflow is ready');
});

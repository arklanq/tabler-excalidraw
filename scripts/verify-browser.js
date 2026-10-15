import { restoreLibraryItems, exportToSvg, loadLibraryFromBlob } from '@excalidraw/excalidraw';

window.checkLibrary = async () => {
  const response = await fetch('/outputs/tabler-icons.excalidrawlib');
  const blob = await response.blob();
  const original = JSON.parse(await blob.text()).libraryItems;
  const loaded = await loadLibraryFromBlob(blob);
  window.items = restoreLibraryItems(loaded, 'unpublished');
  if (items.length !== original.length) throw new Error('Icons were lost during import.');
  for (let i = 0; i < items.length; i++) {
    if (items[i].elements.length !== original[i].elements.length) throw new Error(`Elements were lost: ${original[i].id}.`);
    for (let j = 0; j < items[i].elements.length; j++) {
      const actual = items[i].elements[j];
      const expected = original[i].elements[j];
      for (const key of ['x', 'y', 'width', 'height', 'strokeWidth', 'strokeColor', 'backgroundColor', 'opacity', 'points']) {
        const equal = typeof expected[key] === 'number'
          ? Math.abs(actual[key] - expected[key]) < 0.0001
          : JSON.stringify(actual[key]) === JSON.stringify(expected[key]);
        if (!equal) throw new Error(`Import changed ${key}: ${expected.id}.`);
      }
    }
  }
  return { imported: items.length, elements: items.reduce((sum, item) => sum + item.elements.length, 0) };
};
window.renderIcons = async (start, count) => {
  const results = [];
  for (const item of items.slice(start, start + count)) {
    const svg = await exportToSvg({ elements: item.elements, appState: { exportBackground: false, exportWithDarkMode: false }, files: {}, exportPadding: 0 });
    const points = item.elements.flatMap(el => el.points.map(([x, y]) => [x + el.x, y + el.y]));
    const minX = Math.min(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1]));
    results.push({ id: item.id, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 96 96"><g transform="translate(${minX} ${minY})">${svg.innerHTML}</g></svg>` });
  }
  return results;
};

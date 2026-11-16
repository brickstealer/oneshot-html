/**
 * Builds and sorts a hierarchical folder/project tree from discovered projects.
 */

function createCategoryNode(name, relPath, categoriesMap) {
  const config = categoriesMap?.get(relPath) ?? {};
  return {
    name,
    relPath,
    title: config.title || name,
    description: config.description || '',
    order: typeof config.order === 'number' ? config.order : 0,
    children: [],
    projects: [],
    totalCount: 0,
  };
}

function sortTreeNodes(node) {
  node.projects.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  node.children.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  let count = node.projects.length;
  for (const child of node.children) {
    count += sortTreeNodes(child);
  }
  node.totalCount = count;
  return count;
}

/**
 * Converts a flat project array + category metadata map into a nested tree rooted at "".
 */
export function buildCategoryTree(projects, categoriesMap = new Map()) {
  const root = createCategoryNode('', '', categoriesMap);
  const nodeLookup = new Map([['', root]]);

  for (const project of projects) {
    let current = root;
    let currentPath = '';

    for (const segment of project.categoryParts) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let nextNode = nodeLookup.get(currentPath);
      if (!nextNode) {
        nextNode = createCategoryNode(segment, currentPath, categoriesMap);
        nodeLookup.set(currentPath, nextNode);
        current.children.push(nextNode);
      }
      current = nextNode;
    }

    current.projects.push(project);
  }

  sortTreeNodes(root);
  return root;
}

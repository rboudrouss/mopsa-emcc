import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileItem } from "@/lib";

// File type icons mapping
const fileIcons: Record<string, React.ReactNode> = {
  default: <File className="h-4 w-4 text-muted-foreground" />,
  js: <FileCode className="h-4 w-4 text-yellow-500" />,
  ts: <FileCode className="h-4 w-4 text-blue-500" />,
  tsx: <FileCode className="h-4 w-4 text-blue-500" />,
  jsx: <FileCode className="h-4 w-4 text-yellow-500" />,
  css: <FileCode className="h-4 w-4 text-blue-400" />,
  html: <FileCode className="h-4 w-4 text-orange-500" />,
  json: <FileText className="h-4 w-4 text-yellow-400" />,
  md: <FileText className="h-4 w-4 text-muted-foreground" />,
};

interface FileExplorerProps {
  initialData?: FileItem[];
  className?: string;
  onSelectedFile?: (item: string) => void;
  createFile?: (item: string) => void;
  deleteFile?: (item: string) => void;
  moveFile?: (sourceId: string, targetId: string) => void;
}

export function FileExplorer({
  initialData,
  className,
  onSelectedFile,
  createFile,
  deleteFile,
  moveFile,
}: FileExplorerProps) {
  const [fileStructure, setFileStructure] = React.useState<FileItem[]>(
    initialData || []
  );
  const [selectedItem, setSelectedItem] = React.useState<string | null>(null);
  const [draggedItem, setDraggedItem] = React.useState<FileItem | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    visible: boolean;
    x: number;
    y: number;
    itemId: string | null;
    itemType: "file" | "folder" | "empty" | null;
    parentPath: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    itemId: null,
    itemType: null,
    parentPath: "",
  });
  const [renameItem, setRenameItem] = React.useState<{
    id: string | null;
    name: string;
    isEditing: boolean;
  }>({
    id: null,
    name: "",
    isEditing: false,
  });
  const [newItemInput, setNewItemInput] = React.useState<{
    parentId: string | null;
    parentPath: string;
    type: "file" | "folder" | null;
    isCreating: boolean;
    name: string;
  }>({
    parentId: null,
    parentPath: "",
    type: null,
    isCreating: false,
    name: "",
  });

  // Close context menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Find item by ID in the file structure
  const findItemById = (items: FileItem[], id: string): FileItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItemById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Find parent of an item by ID
  const findParentById = (
    items: FileItem[],
    id: string,
    parent: { items: FileItem[]; path: string } | null = null
  ): { items: FileItem[]; path: string } | null => {
    for (const item of items) {
      if (item.id === id) return parent;
      if (item.children) {
        const currentPath = parent ? `${parent.path}/${item.name}` : item.name;
        const found = findParentById(item.children, id, {
          items: item.children,
          path: currentPath,
        });
        if (found) return found;
      }
    }
    return null;
  };

  // Get full path of an item
  const getItemPath = (
    items: FileItem[],
    id: string,
    currentPath = ""
  ): string | null => {
    for (const item of items) {
      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      if (item.id === id) return itemPath;
      if (item.children) {
        const found = getItemPath(item.children, id, itemPath);
        if (found) return found;
      }
    }
    return null;
  };

  // Update file structure (deep clone and modify)
  const updateFileStructure = (
    items: FileItem[],
    updateFn: (items: FileItem[]) => FileItem[]
  ): FileItem[] => {
    const newItems = JSON.parse(JSON.stringify(items));
    return updateFn(newItems);
  };

  // Move an item to a new parent
  const moveItem = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return; // Can't move to itself

    const sourceItem = findItemById(fileStructure, sourceId);
    if (!sourceItem) return;

    const sourceParent = findParentById(fileStructure, sourceId);
    if (!sourceParent) return; // Root items can't be moved for simplicity

    const targetItem = findItemById(fileStructure, targetId);
    if (!targetItem) return;

    // Only allow dropping into folders
    if (targetItem.type !== "folder") return;

    // Remove from source
    const newStructure = updateFileStructure(fileStructure, (items) => {
      const removeFromParent = (parentItems: FileItem[]) => {
        for (let i = 0; i < parentItems.length; i++) {
          if (parentItems[i].id === sourceId) {
            parentItems.splice(i, 1);
            return true;
          }
          if (parentItems[i].children) {
            if (removeFromParent(parentItems[i].children!)) return true;
          }
        }
        return false;
      };
      removeFromParent(items);
      return items;
    });

    // Add to target
    setFileStructure(
      updateFileStructure(newStructure, (items) => {
        const addToTarget = (parentItems: FileItem[]) => {
          for (let i = 0; i < parentItems.length; i++) {
            if (parentItems[i].id === targetId) {
              if (!parentItems[i].children) parentItems[i].children = [];
              parentItems[i].children!.push(sourceItem);
              return true;
            }
            if (parentItems[i].children) {
              if (addToTarget(parentItems[i].children!)) return true;
            }
          }
          return false;
        };
        addToTarget(items);
        return items;
      })
    );
  };

  const selectItem = (id: string) => {
    setSelectedItem(id);
    let item = findItemById(fileStructure, id);
    if (!item) return;
    if (item.type === "file") {
      onSelectedFile?.(getItemPath(fileStructure, id) || "");
    }
  };

  // Create a new file or folder
  const createNewItem = () => {
    if (
      !newItemInput.isCreating ||
      !newItemInput.type ||
      !newItemInput.name.trim()
    )
      return;

    const newId = `new-${Date.now()}`;
    const newItem: FileItem = {
      id: newId,
      name: newItemInput.name.trim(),
      type: newItemInput.type,
      children: newItemInput.type === "folder" ? [] : undefined,
    };

    if (newItemInput.type === "file") {
      createFile?.(newItem.name);
    }

    if (newItemInput.parentId) {
      // Add to parent folder
      setFileStructure(
        updateFileStructure(fileStructure, (items) => {
          const addToParent = (parentItems: FileItem[]) => {
            for (let i = 0; i < parentItems.length; i++) {
              if (parentItems[i].id === newItemInput.parentId) {
                if (!parentItems[i].children) parentItems[i].children = [];
                parentItems[i].children!.push(newItem);
                return true;
              }
              if (parentItems[i].children) {
                if (addToParent(parentItems[i].children!)) return true;
              }
            }
            return false;
          };
          addToParent(items);
          return items;
        })
      );
    } else {
      // Add to root
      setFileStructure([...fileStructure, newItem]);
    }

    setNewItemInput({
      parentId: null,
      parentPath: "",
      type: null,
      isCreating: false,
      name: "",
    });
  };

  // Rename an item
  const renameItemById = () => {
    if (!renameItem.isEditing || !renameItem.id || !renameItem.name.trim())
      return;

    setFileStructure(
      updateFileStructure(fileStructure, (items) => {
        const rename = (parentItems: FileItem[]) => {
          for (let i = 0; i < parentItems.length; i++) {
            if (parentItems[i].id === renameItem.id) {
              if (parentItems[i].type === "file") {
                let path = getItemPath(fileStructure, renameItem.id) || "";
                moveFile?.(
                  path,
                  path.replace(/[^/]+$/, renameItem.name.trim())
                );
              }

              parentItems[i].name = renameItem.name.trim();
              return true;
            }
            if (parentItems[i].children) {
              if (rename(parentItems[i].children!)) return true;
            }
          }
          return false;
        };
        rename(items);
        return items;
      })
    );

    setRenameItem({
      id: null,
      name: "",
      isEditing: false,
    });
  };

  // Delete an item
  const deleteItem = (id: string) => {
    setFileStructure(
      updateFileStructure(fileStructure, (items) => {
        const deleteFromItems = (parentItems: FileItem[]) => {
          for (let i = 0; i < parentItems.length; i++) {
            if (parentItems[i].id === id) {
              if (parentItems[i].type === "file") {
                deleteFile?.(getItemPath(fileStructure, id) || "");
              }
              parentItems.splice(i, 1);
              return true;
            }
            if (parentItems[i].children) {
              if (deleteFromItems(parentItems[i].children!)) return true;
            }
          }
          return false;
        };
        deleteFromItems(items);
        return items;
      })
    );
  };

  // Handle context menu actions
  const handleContextMenuAction = (action: string) => {
    const { itemId, parentPath } = contextMenu;

    switch (action) {
      case "new-file":
        setNewItemInput({
          parentId: itemId,
          parentPath: parentPath,
          type: "file",
          isCreating: true,
          name: "new-file.txt",
        });
        break;
      case "new-folder":
        setNewItemInput({
          parentId: itemId,
          parentPath: parentPath,
          type: "folder",
          isCreating: true,
          name: "new-folder",
        });
        break;
      case "rename":
        if (itemId) {
          const item = findItemById(fileStructure, itemId);
          if (item) {
            setRenameItem({
              id: itemId,
              name: item.name,
              isEditing: true,
            });
          }
        }
        break;
      case "delete":
        if (itemId) {
          deleteItem(itemId);
        }
        break;
    }

    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div
      className={cn(
        "h-full w-full overflow-auto p-2 font-mono text-sm",
        className
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          itemId: null,
          itemType: "empty",
          parentPath: "",
        });
      }}
    >
      <div className="text-xs uppercase font-semibold mb-2 text-[#6a737d] px-2">
        Explorer
      </div>

      {/* New Item Input */}
      {newItemInput.isCreating && (
        <div className="px-2 py-1 mb-2">
          <div className="text-xs mb-1">
            Creating new {newItemInput.type} in{" "}
            {newItemInput.parentPath || "root"}
          </div>
          <div className="flex">
            <input
              type="text"
              value={newItemInput.name}
              onChange={(e) =>
                setNewItemInput({ ...newItemInput, name: e.target.value })
              }
              className="flex-1 px-2 py-1 text-xs rounded-l outline-none border border-[#3c3c3c] focus:border-[#007fd4]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") createNewItem();
                if (e.key === "Escape")
                  setNewItemInput({ ...newItemInput, isCreating: false });
              }}
            />
            <button
              onClick={createNewItem}
              className="bg-[#007fd4] text-white px-2 py-1 text-xs rounded-r"
            >
              Create
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {fileStructure.map((item) => (
          <FileTreeItem
            key={item.id}
            item={item}
            level={0}
            selectedItem={selectedItem}
            onSelectItem={selectItem}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onMoveItem={moveItem}
            setContextMenu={setContextMenu}
            renameItem={renameItem}
            setRenameItem={setRenameItem}
            onRenameComplete={renameItemById}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-[#252526] border border-[#454545] rounded shadow-lg text-[#cccccc] text-sm py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {(contextMenu.itemType === "folder" ||
            contextMenu.itemType === "empty") && (
            <>
              <button
                className="w-full text-left px-3 py-1 hover:bg-[#2a2d2e] flex items-center"
                onClick={() => handleContextMenuAction("new-file")}
              >
                <Plus className="h-4 w-4 mr-2" />
                New File
              </button>
              <button
                className="w-full text-left px-3 py-1 hover:bg-[#2a2d2e] flex items-center"
                onClick={() => handleContextMenuAction("new-folder")}
              >
                <Folder className="h-4 w-4 mr-2" />
                New Folder
              </button>
              {contextMenu.itemType !== "empty" && (
                <div className="border-t border-[#454545] my-1"></div>
              )}
            </>
          )}

          {contextMenu.itemType !== "empty" && (
            <>
              <button
                className="w-full text-left px-3 py-1 hover:bg-[#2a2d2e] flex items-center"
                onClick={() => handleContextMenuAction("rename")}
              >
                <Edit className="h-4 w-4 mr-2" />
                Rename
              </button>
              <button
                className="w-full text-left px-3 py-1 hover:bg-[#2a2d2e] text-red-400 flex items-center"
                onClick={() => handleContextMenuAction("delete")}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface FileTreeItemProps {
  item: FileItem;
  level: number;
  selectedItem: string | null;
  onSelectItem: (id: string) => void;
  draggedItem: FileItem | null;
  setDraggedItem: (item: FileItem | null) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
  onMoveItem: (sourceId: string, targetId: string) => void;
  setContextMenu: React.Dispatch<
    React.SetStateAction<{
      visible: boolean;
      x: number;
      y: number;
      itemId: string | null;
      itemType: "file" | "folder" | "empty" | null;
      parentPath: string;
    }>
  >;
  renameItem: {
    id: string | null;
    name: string;
    isEditing: boolean;
  };
  setRenameItem: React.Dispatch<
    React.SetStateAction<{
      id: string | null;
      name: string;
      isEditing: boolean;
    }>
  >;
  onRenameComplete: () => void;
  parentPath?: string;
}

function FileTreeItem({
  item,
  level,
  selectedItem,
  onSelectItem,
  draggedItem,
  setDraggedItem,
  dropTarget,
  setDropTarget,
  onMoveItem,
  setContextMenu,
  renameItem,
  setRenameItem,
  onRenameComplete,
  parentPath = "",
}: FileTreeItemProps) {
  const [expanded, setExpanded] = React.useState(level < 1);
  const isSelected = selectedItem === item.id;
  const isDropTarget = dropTarget === item.id;
  const isRenaming = renameItem.isEditing && renameItem.id === item.id;
  const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;

  const handleToggle = () => {
    if (item.type === "folder") {
      setExpanded(!expanded);
    }
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectItem(item.id);
  };

  // Get file extension for icon selection
  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop() || "";
    return fileIcons[extension] || fileIcons.default;
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedItem && draggedItem.id !== item.id) {
      if (item.type === "folder") {
        setDropTarget(item.id);
        e.dataTransfer.dropEffect = "move";
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId && item.type === "folder") {
      onMoveItem(sourceId, item.id);
    }

    setDropTarget(null);
    setDraggedItem(null);
  };

  // Context menu handler
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      itemId: item.id,
      itemType: item.type,
      parentPath: fullPath,
    });
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center py-1 px-2 rounded cursor-pointer hover:bg-[#2a2d2e] transition-colors",
          isSelected && "bg-[#CCC]",
          isDropTarget && "bg-[#264f78] border border-dashed border-[#0e639c]",
          draggedItem && draggedItem.id === item.id && "opacity-50"
        )}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        onClick={handleSelect}
        onDoubleClick={handleToggle}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {item.type === "folder" ? (
          <>
            <span
              className="mr-1 text-[#cccccc]"
              onClick={(e) => {
                e.stopPropagation();
                handleToggle();
              }}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
            {expanded ? (
              <FolderOpen className="h-4 w-4 mr-1.5 text-[#dcb67a]" />
            ) : (
              <Folder className="h-4 w-4 mr-1.5 text-[#dcb67a]" />
            )}
          </>
        ) : (
          <span className="ml-5 mr-1.5">{getFileIcon(item.name)}</span>
        )}

        {isRenaming ? (
          <input
            type="text"
            value={renameItem.name}
            onChange={(e) =>
              setRenameItem({ ...renameItem, name: e.target.value })
            }
            className="bg-[#3c3c3c] text-[#cccccc] px-1 py-0 text-xs rounded outline-none border border-[#007fd4]"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onRenameComplete();
              if (e.key === "Escape")
                setRenameItem({ id: null, name: "", isEditing: false });
            }}
            onBlur={onRenameComplete}
          />
        ) : (
          <span>{item.name}</span>
        )}
      </div>

      {item.type === "folder" && expanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              selectedItem={selectedItem}
              onSelectItem={onSelectItem}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onMoveItem={onMoveItem}
              setContextMenu={setContextMenu}
              renameItem={renameItem}
              setRenameItem={setRenameItem}
              onRenameComplete={onRenameComplete}
              parentPath={fullPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import React from "react";

interface LayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children, sidebar }) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0D1311]">
      {/* The Left Sidebar: A fixed-width container docked to the left edge */}
      <aside className="w-[420px] h-full flex-shrink-0 z-40 border-r border-[#2C3A35] bg-[#131A17] flex flex-col shadow-2xl">
        {sidebar}
      </aside>

      {/* The Map Container: The map takes up the remaining space */}
      <main className="flex-1 relative h-full">
        {children}
      </main>
    </div>
  );
};

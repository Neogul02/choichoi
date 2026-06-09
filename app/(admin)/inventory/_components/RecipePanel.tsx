import type { Ingredient, Recipe } from '@/types/database';

interface MenuTarget {
  menu_id: number;
  menu_name: string;
}

interface Props {
  recipes: Recipe[];
  ingredients: Ingredient[];
  onSelectMenu: (target: MenuTarget) => void;
}

export default function RecipePanel({ recipes, ingredients, onSelectMenu }: Props) {
  const menuMap = new Map<number, { name: string; items: Recipe[] }>();
  for (const r of recipes) {
    if (!menuMap.has(r.menu_id)) {
      menuMap.set(r.menu_id, { name: r.menu_items?.name ?? `메뉴 ${r.menu_id}`, items: [] });
    }
    menuMap.get(r.menu_id)!.items.push(r);
  }

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-extrabold text-ink">레시피 관리</h3>
        <span className="text-[10px] text-ink-faint">메뉴를 탭하면 편집</span>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from(menuMap.entries()).map(([menu_id, { name, items }]) => (
          <button
            key={menu_id}
            onClick={() => onSelectMenu({ menu_id, menu_name: name })}
            className="w-full text-left bg-canvas-soft hover:bg-primary-50 border-[1.5px] border-hairline hover:border-primary-200 rounded-xl px-3.5 py-3 cursor-pointer transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-extrabold text-ink">{name}</span>
              <span className="text-[10px] text-ink-faint">재료 {items.length}종 →</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((r) => {
                const ing = ingMap.get(r.ingredient_id);
                return (
                  <span
                    key={r.ingredient_id}
                    className="flex items-center gap-1 text-[10px] bg-canvas text-ink-muted font-medium px-2 py-0.5 rounded-full border border-[#e8e8e8]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: ing?.color ?? '#ccc' }}
                    />
                    {ing?.name ?? r.ingredient_id}
                    <span className="text-ink-faint">{r.qty_per_unit}{ing?.base_unit}</span>
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

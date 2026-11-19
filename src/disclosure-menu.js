export function openToolMenus(root) {
 return Array.from(root.querySelectorAll('.chart-menu[open]'));
}

export function closeToolMenus(root, target = null, {returnFocus=false}={}) {
 const closed = openToolMenus(root).filter(menu=>!target||!menu.contains(target));
 const last = closed.at(-1);
 closed.forEach(menu=>{menu.open=false;});
 if(returnFocus)last?.querySelector('summary')?.focus({preventScroll:true});
 return closed.length>0;
}

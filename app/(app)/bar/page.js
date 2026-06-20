"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { useRouter } from "next/navigation"

const CATEGORY_ICONS = { beer:"🍺", wine:"🍷", spirits:"🥃", soft:"🥤" }
const CATEGORY_LABELS = { beer:"Beer", wine:"Wine", spirits:"Spirits", soft:"Soft Drinks" }
const CATEGORIES = ["beer","wine","spirits","soft"]

function fmtPrice(p) { return "$" + parseFloat(p).toFixed(2) }
function fmtDate(str) {
  return new Date(str).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onAdd, adding }) {
  return (
    <div style={{ background:"var(--surface)", borderRadius:"14px", border:"1px solid var(--border)", padding:"1rem", display:"flex", flexDirection:"column", alignItems:"center", gap:"0.4rem", textAlign:"center" }}>
      <div style={{ fontSize:"2rem" }}>{product.icon || CATEGORY_ICONS[product.category] || "🍺"}</div>
      <div style={{ fontWeight:700, fontSize:"0.88rem", lineHeight:1.2 }}>{product.name}</div>
      {product.description && <div style={{ fontSize:"0.72rem", color:"var(--text-dim)", lineHeight:1.3 }}>{product.description}</div>}
      <div style={{ fontWeight:800, fontSize:"1rem", color:"var(--amber-dark)", marginTop:"0.15rem" }}>{fmtPrice(product.price)}</div>
      <button
        onClick={() => onAdd(product)}
        disabled={adding === product.id}
        style={{ marginTop:"0.25rem", background:"var(--amber)", color:"#fff", border:"none", borderRadius:"20px", padding:"0.45rem 1rem", fontWeight:700, fontSize:"0.8rem", cursor:"pointer", width:"100%", opacity:adding===product.id?0.6:1 }}
      >
        {adding === product.id ? "Adding…" : "+ Add to Tab"}
      </button>
    </div>
  )
}

// ── Tab History Row ───────────────────────────────────────────────────────────
function TabRow({ entry, onRemove, canRemove }) {
  const p = entry.bar_products
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.5rem", padding:"0.75rem 0", borderBottom:"1px solid var(--border)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", flex:1, minWidth:0 }}>
        <span style={{ fontSize:"1.2rem" }}>{p?.icon || "🍺"}</span>
        <div>
          <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{p?.name || "Unknown"}</div>
          <div style={{ fontSize:"0.75rem", color:"var(--text-dim)" }}>{fmtDate(entry.consumed_at)}</div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", flexShrink:0 }}>
        <div style={{ fontWeight:700, color:"var(--amber-dark)" }}>{fmtPrice(p?.price || 0)}</div>
        {canRemove && (
          <button onClick={() => onRemove(entry.id)}
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:"8px", padding:"0.25rem 0.5rem", fontSize:"0.72rem", color:"var(--text-dim)", cursor:"pointer" }}>
            ✕
          </button>
        )}
        {!canRemove && (
          <span style={{ fontSize:"0.68rem", color:"var(--text-dim)", background:"var(--surface2)", borderRadius:"6px", padding:"0.2rem 0.4rem" }}>Reconciled</span>
        )}
      </div>
    </div>
  )
}

export default function BarPage() {
  const { member, loading: userLoading } = useUser()
  const router = useRouter()
  const [products,  setProducts]  = useState([])
  const [tabItems,  setTabItems]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(null)
  const [catFilter, setCat]       = useState("all")
  const [view,      setView]      = useState("order") // order | tab
  const [toast,     setToast]     = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const loadTab = useCallback(async () => {
    if (!member?.id) return
    const { data } = await supabase
      .from("bar_tabs")
      .select("id, quantity, consumed_at, reconciliation_id, bar_products(id, name, icon, price, category)")
      .eq("member_id", member.id)
      .order("consumed_at", { ascending: false })
      .limit(50)
    setTabItems(data || [])
  }, [member?.id])

  useEffect(() => {
    if (!member) return
    // Redirect non-opted-in members
    if (!member.bar_opt_in) { router.replace("/home"); return }
    async function load() {
      const { data: prods } = await supabase
        .from("bar_products")
        .select("*")
        .eq("active", true)
        .order("category")
        .order("name")
      setProducts(prods || [])
      await loadTab()
      setLoading(false)
    }
    load()
  }, [member, router, loadTab])

  async function addToTab(product) {
    if (!member?.id) return
    setAdding(product.id)
    const { error } = await supabase.from("bar_tabs").insert({
      member_id: member.id,
      product_id: product.id,
      quantity: 1,
      consumed_at: new Date().toISOString(),
    })
    if (!error) {
      showToast(product.icon + " " + product.name + " added to your tab")
      await loadTab()
    }
    setAdding(null)
  }

  async function removeFromTab(id) {
    await supabase.from("bar_tabs").delete().eq("id", id)
    setTabItems(t => t.filter(x => x.id !== id))
  }

  if (userLoading || loading) return (
    <div style={{ padding:"1.25rem 1rem" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
        {[1,2,3].map(i => <div key={i} style={{ height:80, borderRadius:"14px", background:"var(--surface2)" }} />)}
      </div>
    </div>
  )

  // Tab total (unreconciled only)
  const openItems = tabItems.filter(t => !t.reconciliation_id)
  const runningTotal = openItems.reduce((s,t) => s + parseFloat(t.bar_products?.price||0) * (t.quantity||1), 0)

  const filteredProducts = catFilter === "all" ? products : products.filter(p => p.category === catFilter)

  return (
    <div style={{ padding:"1rem 1rem 6rem" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:"1rem", left:"50%", transform:"translateX(-50%)", background:"#15803d", color:"#fff", padding:"0.7rem 1.25rem", borderRadius:"12px", fontSize:"0.88rem", fontWeight:600, zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,0.2)", whiteSpace:"nowrap" }}>
          ✓ {toast}
        </div>
      )}

      {/* Running total banner */}
      {openItems.length > 0 && (
        <div style={{ background:"var(--amber)", borderRadius:"14px", padding:"0.85rem 1rem", marginBottom:"1rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:"0.9rem" }}>My Open Tab</div>
            <div style={{ color:"rgba(255,255,255,0.85)", fontSize:"0.78rem" }}>{openItems.length} item{openItems.length!==1?"s":""}</div>
          </div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:"1.4rem" }}>{fmtPrice(runningTotal)}</div>
        </div>
      )}

      {/* View switcher */}
      <div style={{ display:"flex", gap:"0.4rem", marginBottom:"1rem" }}>
        {[["order","🍺 Order"],["tab","📋 My Tab"]].map(([v,l]) => (
          <button key={v} onClick={()=>setView(v)}
            style={{ flex:1, padding:"0.55rem", borderRadius:"10px", border:"1px solid", borderColor:view===v?"var(--amber)":"var(--border)", background:view===v?"var(--amber)20":"var(--surface)", fontWeight:600, fontSize:"0.85rem", cursor:"pointer", color:view===v?"var(--amber-dark)":"var(--text)" }}>
            {l}
          </button>
        ))}
      </div>

      {/* ORDER VIEW */}
      {view === "order" && (
        <>
          {/* Category filter */}
          <div style={{ display:"flex", gap:"0.4rem", overflowX:"auto", paddingBottom:"0.25rem", marginBottom:"1rem" }}>
            {["all",...CATEGORIES].map(c => (
              <button key={c} onClick={()=>setCat(c)}
                style={{ padding:"0.35rem 0.75rem", borderRadius:"20px", border:"1px solid", borderColor:catFilter===c?"var(--amber)":"var(--border)", background:catFilter===c?"var(--amber)":"var(--surface)", color:catFilter===c?"#fff":"var(--text)", fontSize:"0.75rem", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                {c==="all"?"All":CATEGORY_ICONS[c]+" "+CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <div style={{ textAlign:"center", padding:"2rem", color:"var(--text-dim)", fontSize:"0.9rem" }}>No products available</div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"0.6rem" }}>
              {filteredProducts.map(p => <ProductCard key={p.id} product={p} onAdd={addToTab} adding={adding} />)}
            </div>
          )}
        </>
      )}

      {/* TAB VIEW */}
      {view === "tab" && (
        <div>
          {tabItems.length === 0 ? (
            <div style={{ textAlign:"center", padding:"2rem", color:"var(--text-dim)", fontSize:"0.9rem" }}>Your tab is empty</div>
          ) : (
            <>
              <div style={{ background:"var(--surface)", borderRadius:"14px", border:"1px solid var(--border)", padding:"0 1rem" }}>
                {tabItems.map(t => (
                  <TabRow key={t.id} entry={t} onRemove={removeFromTab} canRemove={!t.reconciliation_id} />
                ))}
              </div>
              <div style={{ marginTop:"1rem", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 0.25rem" }}>
                <div style={{ fontSize:"0.8rem", color:"var(--text-dim)" }}>Reconciled items cannot be removed</div>
                <div style={{ fontWeight:800, fontSize:"1.1rem" }}>Total: {fmtPrice(runningTotal)}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

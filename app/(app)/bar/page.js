"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { useRouter } from "next/navigation"

const CATEGORY_ICONS  = { beer:"🍺", wine:"🍷", spirits:"🥃", soft:"🥤" }
const CATEGORY_LABELS = { beer:"Beer", wine:"Wine", spirits:"Spirits", soft:"Soft Drinks" }
const CATEGORIES = ["beer","wine","spirits","soft"]

function fmtPrice(p) { return "$" + parseFloat(p).toFixed(2) }
function fmtDate(str) {
  return new Date(str).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" })
}
function isToday(dateStr) {
  return new Date(dateStr).toDateString() === new Date().toDateString()
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
        style={{ marginTop:"0.25rem", background:"var(--amber)", color:"#fff", border:"none", borderRadius:"20px", padding:"0.45rem 1rem", fontWeight:700, fontSize:"0.8rem", cursor:"pointer", width:"100%", opacity:adding===product.id?0.6:1 }}>
        {adding === product.id ? "Adding…" : "+ Add to Tab"}
      </button>
    </div>
  )
}

export default function BarPage() {
  const { member, loading: userLoading } = useUser()
  const router = useRouter()
  const [products,     setProducts]     = useState([])
  const [openItems,    setOpenItems]    = useState([])   // unreconciled bar_tabs
  const [outstanding,  setOutstanding]  = useState([])   // reconciled but unpaid periods
  const [paidHistory,  setPaidHistory]  = useState([])   // settled bar_member_payments
  const [loading,      setLoading]      = useState(true)
  const [adding,       setAdding]       = useState(null)
  const [catFilter,    setCat]          = useState("all")
  const [view,         setView]         = useState("order")
  const [toast,        setToast]        = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const loadTab = useCallback(async () => {
    if (!member?.id) return

    // Open (unreconciled) items
    const { data: open } = await supabase
      .from("bar_tabs")
      .select("id, quantity, consumed_at, bar_products(id, name, icon, price, category)")
      .eq("member_id", member.id)
      .is("reconciliation_id", null)
      .order("consumed_at", { ascending: false })
    setOpenItems(open || [])

    // Payment history — periods this member has settled
    const { data: paid } = await supabase
      .from("bar_member_payments")
      .select("id, reconciliation_id, total_amount, paid_at, bar_reconciliations(period_start, period_end)")
      .eq("member_id", member.id)
      .order("paid_at", { ascending: false })
    setPaidHistory(paid || [])

    // Reconciled tabs — to find outstanding unpaid periods
    const { data: reconTabs } = await supabase
      .from("bar_tabs")
      .select("quantity, reconciliation_id, bar_products(price), bar_reconciliations(id, period_start, period_end)")
      .eq("member_id", member.id)
      .not("reconciliation_id", "is", null)

    // Build outstanding: reconciled periods with no payment record
    const paidIds = new Set((paid || []).map(p => p.reconciliation_id))
    const reconMap = {}
    for (const row of reconTabs || []) {
      const rid = row.reconciliation_id
      if (paidIds.has(rid)) continue
      if (!reconMap[rid]) {
        reconMap[rid] = {
          reconciliation_id: rid,
          period_start: row.bar_reconciliations?.period_start,
          period_end:   row.bar_reconciliations?.period_end,
          total: 0,
        }
      }
      reconMap[rid].total = parseFloat(
        (reconMap[rid].total + parseFloat(row.bar_products?.price || 0) * (row.quantity || 1)).toFixed(2)
      )
    }
    setOutstanding(
      Object.values(reconMap).sort((a, b) => new Date(a.period_end) - new Date(b.period_end))
    )
  }, [member?.id])

  useEffect(() => {
    if (!member) return
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
      member_id:   member.id,
      product_id:  product.id,
      quantity:    1,
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
    setOpenItems(t => t.filter(x => x.id !== id))
  }

  if (userLoading || loading) return (
    <div style={{ padding:"1.25rem 1rem" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
        {[1,2,3].map(i => <div key={i} style={{ height:80, borderRadius:"14px", background:"var(--surface2)" }} />)}
      </div>
    </div>
  )

  const runningTotal    = openItems.reduce((s,t) => s + parseFloat(t.bar_products?.price||0) * (t.quantity||1), 0)
  const outstandingTotal = outstanding.reduce((s, o) => s + o.total, 0)
  const filteredProducts = catFilter === "all" ? products : products.filter(p => p.category === catFilter)

  return (
    <div style={{ padding:"1rem 1rem 6rem" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:"1rem", left:"50%", transform:"translateX(-50%)", background:"#15803d", color:"#fff", padding:"0.7rem 1.25rem", borderRadius:"12px", fontSize:"0.88rem", fontWeight:600, zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,0.2)", whiteSpace:"nowrap" }}>
          ✓ {toast}
        </div>
      )}

      {/* Outstanding balance warning banner */}
      {outstanding.length > 0 && (
        <div style={{ background:"var(--amber)", borderRadius:"14px", padding:"0.85rem 1rem", marginBottom:"0.75rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:"0.9rem" }}>⚠ Balance Due</div>
            <div style={{ color:"rgba(255,255,255,0.85)", fontSize:"0.78rem" }}>
              {outstanding.length} unpaid period{outstanding.length !== 1 ? "s" : ""} — see admin to settle
            </div>
          </div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:"1.4rem" }}>{fmtPrice(outstandingTotal)}</div>
        </div>
      )}

      {/* Running total banner */}
      {openItems.length > 0 && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--amber)", borderRadius:"14px", padding:"0.85rem 1rem", marginBottom:"1rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:"0.9rem" }}>My Open Tab</div>
            <div style={{ color:"var(--text-dim)", fontSize:"0.78rem" }}>{openItems.length} item{openItems.length!==1?"s":""}</div>
          </div>
          <div style={{ color:"var(--amber-dark)", fontWeight:800, fontSize:"1.4rem" }}>{fmtPrice(runningTotal)}</div>
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
          <div style={{ display:"flex", gap:"0.4rem", overflowX:"auto", paddingBottom:"0.25rem", marginBottom:"1rem" }}>
            {["all",...CATEGORIES].map(c => (
              <button key={c} onClick={()=>setCat(c)}
                style={{ padding:"0.35rem 0.75rem", borderRadius:"20px", border:"1px solid", borderColor:catFilter===c?"var(--amber)":"var(--border)", background:catFilter===c?"var(--amber)":"var(--surface)", color:catFilter===c?"#fff":"var(--text)", fontSize:"0.75rem", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                {c==="all"?"All":CATEGORY_ICONS[c]+" "+CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          {filteredProducts.length === 0
            ? <div style={{ textAlign:"center", padding:"2rem", color:"var(--text-dim)", fontSize:"0.9rem" }}>No products available</div>
            : <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"0.6rem" }}>
                {filteredProducts.map(p => <ProductCard key={p.id} product={p} onAdd={addToTab} adding={adding} />)}
              </div>
          }
        </>
      )}

      {/* TAB VIEW */}
      {view === "tab" && (
        <div>
          {openItems.length === 0 && outstanding.length === 0 && paidHistory.length === 0 ? (
            <div style={{ textAlign:"center", padding:"2rem", color:"var(--text-dim)", fontSize:"0.9rem" }}>Your tab is empty</div>
          ) : (
            <>
              {/* Open (editable) items */}
              {openItems.length > 0 && (
                <div style={{ marginBottom:"1.25rem" }}>
                  <div style={{ fontWeight:700, fontSize:"0.8rem", color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"0.5rem" }}>Current Tab</div>
                  <div style={{ background:"var(--surface)", borderRadius:"14px", border:"1px solid var(--border)", padding:"0 1rem" }}>
                    {openItems.map((t, i) => {
                      const p = t.bar_products
                      const canDelete = isToday(t.consumed_at)
                      return (
                        <div key={t.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.5rem", padding:"0.75rem 0", borderBottom: i < openItems.length-1 ? "1px solid var(--border)" : "none" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", flex:1, minWidth:0 }}>
                            <span style={{ fontSize:"1.2rem" }}>{p?.icon || "🍺"}</span>
                            <div>
                              <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{p?.name || "Unknown"}</div>
                              <div style={{ fontSize:"0.75rem", color:"var(--text-dim)" }}>
                                {new Date(t.consumed_at).toLocaleDateString("en-AU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                              </div>
                            </div>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", flexShrink:0 }}>
                            <div style={{ fontWeight:700, color:"var(--amber-dark)" }}>{fmtPrice(p?.price||0)}</div>
                            {canDelete && (
                              <button onClick={() => removeFromTab(t.id)}
                                style={{ background:"none", border:"1px solid var(--border)", borderRadius:"8px", padding:"0.25rem 0.5rem", fontSize:"0.72rem", color:"var(--text-dim)", cursor:"pointer" }}>
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop:"0.6rem", display:"flex", justifyContent:"flex-end", padding:"0 0.25rem" }}>
                    <div style={{ fontWeight:800, fontSize:"1.05rem" }}>Total: {fmtPrice(runningTotal)}</div>
                  </div>
                </div>
              )}

              {/* Outstanding unpaid periods */}
              {outstanding.length > 0 && (
                <div style={{ marginBottom:"1.25rem" }}>
                  <div style={{ fontWeight:700, fontSize:"0.8rem", color:"var(--amber-dark)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"0.5rem" }}>⚠ Balance Due</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
                    {outstanding.map(o => (
                      <div key={o.reconciliation_id} style={{ background:"var(--amber)12", borderRadius:"12px", border:"1px solid var(--amber)", padding:"0.75rem 1rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:"0.88rem", color:"var(--amber-dark)" }}>Unpaid Balance</div>
                          <div style={{ fontSize:"0.75rem", color:"var(--text-dim)" }}>
                            {o.period_start && o.period_end
                              ? `${fmtDate(o.period_start)} – ${fmtDate(o.period_end)}`
                              : "Past period"}
                          </div>
                        </div>
                        <div style={{ fontWeight:800, fontSize:"1.05rem", color:"var(--amber-dark)" }}>{fmtPrice(o.total)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:"0.8rem", color:"var(--text-dim)", marginTop:"0.5rem", textAlign:"center" }}>
                    Please see admin to settle your outstanding balance.
                  </div>
                </div>
              )}

              {/* Payment history */}
              {paidHistory.length > 0 && (
                <div>
                  <div style={{ fontWeight:700, fontSize:"0.8rem", color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"0.5rem" }}>Payment History</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
                    {paidHistory.map(p => {
                      const r = p.bar_reconciliations
                      return (
                        <div key={p.id} style={{ background:"var(--surface)", borderRadius:"12px", border:"1px solid var(--border)", padding:"0.75rem 1rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ fontWeight:600, fontSize:"0.88rem", color:"var(--green)" }}>✓ Paid</div>
                            <div style={{ fontSize:"0.75rem", color:"var(--text-dim)" }}>
                              {r ? `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}` : fmtDate(p.paid_at)}
                            </div>
                          </div>
                          <div style={{ fontWeight:800, fontSize:"1rem", color:"var(--text)" }}>{fmtPrice(p.total_amount)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

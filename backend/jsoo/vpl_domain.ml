(* vpl_domain.ml, VPL relational domain, jsoo-backend plugin.
 *
 * Port of try-mopsa's vpl_domain.ml (gitlab.com/rmonat/mopsa-web,
 * analyzer/languages/universal/numeric/relational/vpl_domain.ml): a
 * relational numeric domain backed by the pure-OCaml VPL polyhedra
 * library (vpl-core), usable from JavaScript where Apron's C stubs are
 * only no-op-stubbed (runtime_stubs.js).
 *
 * The body below is kept as close to the try-mopsa original as
 * possible, only this prologue (qualified opens/aliases, the original
 * is compiled inside the library) and the final activation differ.
 *
 * NB: Very early work VPL domain, aiming to handle integers first and no
 * support for weak update & co *)

open Mopsa_analyzer
open MopsaLib
open Mopsa_utils.Core        (* analyzer/dune env opens these for library *)
open Mopsa_utils.Containers  (* sources; replicated here, file-scoped.    *)

module Relational = Languages.Universal.Numeric.Relational
module Instances = Relational.Instances
module Domain = Relational.Domain
module Common = Languages.Universal.Numeric.Common
module Values = Languages.Universal.Numeric.Values

open Common
open Languages.Universal.Lang.Ast
open Sig.Abstraction.Simplified

let vpl_counter = ref 1

module VPLEquiv =
struct
  module E = Equiv.Make(
  struct
    type t = var
    let compare = compare_var
    let print fmt v = Format.fprintf fmt "%a" pp_var v
  end)(
  struct
    type t = Vpl.Var.t
    let compare = Vpl.Var.cmp
    let print fmt v = Format.fprintf fmt "%s" (Vpl.Var.to_string v)
  end)

  include E

  type t = E.t

  let add v equiv =
    let vv = Vpl.Var.fromInt !vpl_counter in
    incr vpl_counter;
    vv, E.add (v, vv) equiv
end

let mopsa_to_vpl_var (v : var) (equiv : VPLEquiv.t) : Vpl.Var.t * VPLEquiv.t =
  try VPLEquiv.find_l v equiv, equiv
  with Not_found ->
    VPLEquiv.add v equiv

let mopsa_to_vpl_vars (l:var list) (b: VPLEquiv.t) : Vpl.Var.t list * VPLEquiv.t =
  let () = if l <> [] then
      Debug.debug ~channel:"universal.numeric.relational" "adding new var %a starting from id %d" (Format.pp_print_list pp_var) l !vpl_counter in
  List.fold_left (fun (accv,accb) v ->
      let vv, accb = mopsa_to_vpl_var v accb in
      (vv::accv),accb
    ) ([],b) l


let vpl_to_mopsa_var (v: Vpl.Var.t) (b : VPLEquiv.t) : var =
  try VPLEquiv.find_r v b
  with Not_found -> panic "VPL variable %s not found in VPLEquiv=%a" (Vpl.Var.to_string v) VPLEquiv.print b

module VPL (* : Instances.RELATIONAL enforced the other way to avoid cyclic deps *) =
struct

  open Vpl__UserInterface.UncertifiedZ

  type t =
    Vpl.Domains.UncertifiedZ.t *  (** Abstract relational state *)
    VPLEquiv.t (** Bindings between Mopsa and VPL variables *)

  include GenDomainId(struct
      type nonrec t = t
      let name = "universal.numeric.relational"
    end)

  let numeric_name = "vpl"

  let top = top, VPLEquiv.empty

  let bottom = bottom, VPLEquiv.empty

  let is_bottom (abs, _) = is_bottom abs

  let canon cstr =
    (* multiply every term by lcm to avoid conversion issue when calling of_cstrs *)
    (* a bit similar to Vpl.Cstr.Rat.canon, but this one does not work on x + 1/2y = c *)
    let open Vpl.Cstr.Rat in
    let coeffs = cstr.c :: (List.map snd (Vpl.Cstr.Rat.Vec.toList cstr.v)) in
    let denominators =
      List.filter_map (fun c ->
          if Q.equal c Q.zero then None
          else Some (Q.den c)) coeffs in
    let lcm =
      List.fold_left Z.lcm Z.one denominators in
    Vpl.Cstr.Rat.mulc (Q.of_bigint lcm) cstr

  let print_state printer (a, bnd) =
    (* We don't use the VPL's to_string to have a unified representation of constraints *)
    let cstrs =
      if is_bottom (a, bnd) then
        []
      else
        get_cstrs a
    in
    let var_printer = fun fmt var -> Format.fprintf fmt "%a" pp_var (vpl_to_mopsa_var var bnd) in
    let pretty_cstr cstr =
      let cstr = canon cstr in
      let open Vpl.Cstr.Rat in
      let l_vec, r_vec =
        let l = Vpl.Vector.Rat.toList (get_v cstr) in
        let lv, rv = List.partition (fun (var, coeff) -> Coeff.le Coeff.z coeff) l in
        let rv = List.map (fun (var, coeff) -> var, Coeff.neg coeff) rv in
        lv, rv in
      let l_coeff, r_coeff =
        let c = get_c cstr in
        if Coeff.equal c Coeff.z then
          "", ""
        else if Coeff.le c Coeff.z then
          Coeff.to_string (Coeff.neg c), ""
        else
          "", Coeff.to_string c
          (* FIXME handle 0 *)
      in
      let sgn = match get_typ cstr with
        | Eq -> "="
        | Le -> "≤"
        | Lt -> "<" in
      let pp_vc_l fmt l =
        Format.pp_print_list
          ~pp_sep:(fun fmt () -> Format.fprintf fmt " + ")
          (fun fmt (v, c) ->
             if Coeff.equal c Coeff.u then
               var_printer fmt v
             else
               Format.fprintf fmt "%s%a"
                 (Coeff.to_string c)
                 var_printer v
          ) fmt l in
      Format.asprintf "%a%s %s %s%a"
        pp_vc_l l_vec
        (if List.length l_vec = 0 then
           if String.equal l_coeff "" then "0"
           else l_coeff
         else
         if String.equal l_coeff "" then ""
         else " + " ^ l_coeff)
        sgn
        (if List.length r_vec = 0 then
           if String.equal r_coeff "" then "0"
           else r_coeff
         else
         if String.equal r_coeff "" then ""
         else r_coeff ^ " + ")
        pp_vc_l r_vec
    in
    let cstrs_s = List.map pretty_cstr cstrs in
    if !Domain.opt_show_relational_domain then
      let dom = VPLEquiv.fold (fun (a, _) acc -> a::acc) bnd [] in
      pp_obj_map printer
        [
          String "domain", List (
            (List.map (fun v -> String (Format.asprintf "%a" pp_var v)) dom,
             { sopen = "{"; ssep = ","; sclose = "}"; sbind = "" }
            ));
          String "relations", pbox (pp_list pp_string) cstrs_s;
          (* String "ll-relations", *)
          (* (pbox pp_string *)
          (*    ( *)
          (*      (\* Using the UserInterface one probably has a bad interaction with the lifter and the custom variable translation function isn't called *\) *)
          (*      Vpl.Domains.UncertifiedZ.to_string (fun var -> *)
          (*          try *)
          (*            Format.asprintf "%a" pp_var (vpl_to_mopsa_var var bnd) *)
          (*          with _ -> *)
          (*            Format.asprintf "?(%d)" (Vpl.Var.toInt var) *)
          (*        ) a *)
          (*    ) *)
          (* ) *)
        ]
        ~path:[Key "numeric-relations"]
    else
      pprint
        ~path:[Key "numeric-relations"]
        printer
        (pbox (pp_list pp_string) cstrs_s)

  let project_on_vars vars (a, bnd) =
    let dom = VPLEquiv.fold (fun (a, _) acc -> a::acc) bnd [] in
    let to_remove = List.filter (fun v -> not (List.mem v vars)) dom in
    let to_remove_vpl, bnd = mopsa_to_vpl_vars to_remove bnd in
    let a' = project_vars to_remove_vpl a in
    let bnd' = List.fold_left (fun bnd to_remove_vpl -> VPLEquiv.remove_r to_remove_vpl bnd) bnd to_remove_vpl in
    a', bnd'

  let unify (a1, bnd1) (a2, bnd2) =
    if is_bottom (a1, bnd1) then (a1, a2, bnd2)
    else if is_bottom (a2, bnd2) then (a1, a2, bnd1)
    else if VPLEquiv.compare bnd1 bnd2 = 0 then (a1, a2, bnd1)
    else
    let dom1 = VPLEquiv.fold (fun (a, _) acc -> VarSet.add a acc) bnd1 VarSet.empty in
    let dom2 = VPLEquiv.fold (fun (a, _) acc -> VarSet.add a acc) bnd2 VarSet.empty in

    let dom = VarSet.inter dom1 dom2 in
    let () = Debug.debug ~channel:"universal.numeric.relational" "UNIFY@.(a1, bnd1) = %a@.(a2, bnd2)=%a@.dom =%a@." (format print_state) (a1, bnd1) (format print_state) (a2, bnd2) (VarSet.fprint SetExt.printer_default pp_var) dom in
    let a1, bnd1 = project_on_vars (VarSet.elements dom) (a1, bnd1) in
    let a2, bnd2 = project_on_vars (VarSet.elements dom) (a2, bnd2) in

    let a2, bnd = VarSet.fold (fun mopsa_var (a2, bnd) ->
        let vpl_var1, _ = mopsa_to_vpl_var mopsa_var bnd1 in
        let vpl_var2, _ = mopsa_to_vpl_var mopsa_var bnd2 in
        let bnd = VPLEquiv.E.add (mopsa_var, vpl_var1) bnd in

        if Vpl.Var.cmp vpl_var1 vpl_var2 = 0 then a2, bnd
        else
          let a2 =
            (* a2 but where all occurences of vpl_var2 have been replaced by vpl_var1 *)
            List.fold_left (fun a cstr ->
                let new_cond =
                  let new_cstr = Vpl.Cstr.Rat.rename vpl_var2 vpl_var1 cstr in
                  let new_cstr_int = canon new_cstr in
                  Cond.of_cstrs [new_cstr_int] in
                assume (of_cond new_cond) a
              ) (fst top) (get_cstrs a2) in
          a2, bnd
      ) dom (a2, VPLEquiv.empty) in
    let () = Debug.debug ~channel:"universal.numeric.relational" "UNIFY RESULT=@.%a@.%a@." (format print_state) (a1, bnd) (format print_state) (a2, bnd) in
    a1, a2, bnd

  let subset (a1, bnd1) (a2, bnd2) =
    let a1, a2, bnd = unify (a1, bnd1) (a2, bnd2) in
    leq a1 a2

  let join (a1, bnd1) (a2, bnd2) =
    let a1, a2, bnd = unify (a1, bnd1) (a2, bnd2) in
    join a1 a2, bnd

  let meet (a1, bnd1) (a2, bnd2) =
    let a1, a2, bnd = unify (a1, bnd1) (a2, bnd2) in
    meet a1 a2, bnd

  let widen _ (a1, bnd1) (a2, bnd2) =
    let a1, a2, bnd = unify (a1, bnd1) (a2, bnd2) in
    widen a1 a2, bnd

  let init prog =
    vpl_counter := 1;
    top, [Alarm.A_prototype_domain (name ^ "(" ^ numeric_name ^ ")")]

  let is_var_numeric_type v = vtyp v = T_int || vtyp v = T_bool
                                                  (* is_numeric_type (vtyp v) *)

  let add_missing_vars (a, bnd) lv : t =
    let lv = List.sort_uniq compare lv in
    let lv = List.filter (fun v ->
        not (VPLEquiv.mem_l v bnd)
        && (vtyp v = T_int || vtyp v = T_bool)) lv in
    let int_vars, bnd = mopsa_to_vpl_vars lv bnd in
    a, bnd

  let forget_var var (a, bnd) =
    let vpl_var, bnd = mopsa_to_vpl_var var bnd in
    project [vpl_var] a, bnd

  let remove_var var (a, bnd) =
    let vpl_var, bnd = mopsa_to_vpl_var var bnd in
    project [vpl_var] a,
    VPLEquiv.remove_l var bnd




  let expand origin_var new_var (a, bnd) =
    (* Expand isn't exposed in the VPL interface, so let's just get all
       constraints from `origin_var` and assume them again for `new_var`.
       Corresponds to Gopan et al's TACAS'04 implementation *)
    let origin_vpl, bnd = mopsa_to_vpl_var origin_var bnd in
    let new_vpl, bnd = mopsa_to_vpl_var new_var bnd in
    (* let () = debug "expand %a[%s] %a[%s]" *)
    (*     pp_var origin_var *)
    (*     (Vpl.Var.to_string origin_vpl) *)
    (*     pp_var new_var *)
    (*     (Vpl.Var.to_string new_vpl) *)
    (* in *)
    let a = get_cstrs a |>
            List.fold_left
              (fun a cstr ->
                 let new_cond =
                   let new_cstr = Vpl.Cstr.Rat.rename origin_vpl new_vpl cstr in
                   let new_cstr_int = canon new_cstr in
                   Cond.of_cstrs [new_cstr_int] in
                 (* FIXME: no need to assume if Cond hasn't changed? *)
                 assume (of_cond new_cond) a
              ) a in
    a, bnd

  let rename from_var to_var (a, bnd) =
    (* VPL User interface doesn't expose a rename operator for now... *)
    (* We reuse the Idea from one of their functors to rename in the bindings and not the representation. *)
    let from_vpl, bnd = mopsa_to_vpl_var from_var bnd in
    if VPLEquiv.mem_l to_var bnd then
      raise (Stdlib.Invalid_argument "rename must be intro fresh new variable")
    else
      a,
      VPLEquiv.remove_l from_var bnd |>
      VPLEquiv.E.add (to_var, from_vpl)

  let fold target_var to_fold_var (a, bnd) =
    (* Fold isn't exposed in the VPL interface, so we implement it as a join
       between `a` and `a'`, modified with a renaming and the to_fold_var
       removed. Corresponds to Gopan et al's TACAS'04 implementation. *)
    let a', bnd' = rename to_fold_var target_var (a, bnd) in
    let r, bnd' = join (a, bnd') (a', bnd')
        (* due to the new rename, we want (a, bnd**'*\) here to avoid any VPLEquiv.concat crash *) in
    remove_var to_fold_var (r, bnd')

  exception ImpreciseExpression

  module IT = Vpl.Domains.InterfaceZ.Term
  module IC = Vpl.Domains.InterfaceZ.Cond
  (** Translates expression exp into a VPL term. l is a list of temporaries introduced during the conversion *)
  let rec exp_to_vpl exp (abs, bnd) l : a_expr * t * var list =
    match ekind exp with
    | E_constant (C_int_interval (ItvUtils.IntBound.Finite lo, ItvUtils.IntBound.Finite hi)) when Z.(lo = hi) ->
      IT.Cte lo, (abs, bnd), l

    | E_constant (C_int n) ->
      IT.Cte n, (abs, bnd), l

    | E_var (x, mode) when var_mode x mode = STRONG ->
      let xx, bnd = mopsa_to_vpl_var x bnd in
      IT.Var xx, (abs, bnd), l

    | E_var (x, mode) when var_mode x mode = WEAK ->
      let x' = mktmp ~typ:exp.etyp () in
      let x_vpl, bnd = mopsa_to_vpl_var x bnd in
      let x_vpl', bnd = mopsa_to_vpl_var x' bnd in
      let (abs, bnd) = expand x x' (abs, bnd) in
      IT.Var x_vpl', (abs, bnd), x_vpl' :: l

    | E_binop(binop, e1, e2) ->
      let e1', (abs, bnd), l = exp_to_vpl e1 (abs, bnd) l in
      let e2', (abs, bnd), l = exp_to_vpl e2 (abs, bnd) l in
      begin match binop with
        | O_plus -> IT.Add (e1', e2'), (abs, bnd), l
        | O_minus -> IT.Add (e1', IT.Opp e2'), (abs, bnd), l
        | O_mult -> IT.Mul (e1', e2'), (abs, bnd), l
        | O_div -> IT.Div (e1', e2'), (abs, bnd), l
        | _ -> raise ImpreciseExpression
      end

    | _ -> raise ImpreciseExpression

  let rec bexp_to_vpl e (abs, bnd) l =
    match ekind e with
    | E_binop((O_gt | O_ge | O_lt | O_le | O_eq) as comp_op, e0, e1) ->
      let e0', (abs, bnd), l = exp_to_vpl e0 (abs, bnd) l in
      let e1', (abs, bnd), l = exp_to_vpl e1 (abs, bnd) l in
      let vpl_op = match comp_op with
        | O_lt -> Vpl.Cstr_type.LT
        | O_le -> LE
        | O_eq -> EQ
        | O_ge -> GE
        | O_gt -> GT
        | _ -> assert false
      in
      Dnf.singleton (vpl_op, e0', e1'), (abs, bnd), l

    | E_unop(O_log_not, exp') ->
      let dnf, (abs, bnd), l = bexp_to_vpl exp' (abs,bnd) l in
      Dnf.mk_neg (fun (op, e1, e2) ->
          let open Vpl.Cstr_type in
          match op with
          | EQ ->
            Dnf.mk_or
              (Dnf.singleton (GT, e1, e2))
              (Dnf.singleton (GT, e2, e1))
          | GT ->
            Dnf.singleton (GE, e2, e1)
          | LT ->
            Dnf.singleton (LE, e2, e1)
          | GE ->
            Dnf.singleton (GT, e2, e1)
          | LE ->
            Dnf.singleton (LT, e2, e1)
          | _ -> assert false
        ) dnf,
      (abs, bnd), l


    | _ ->
      raise ImpreciseExpression


  let assume stmt ask (a, bnd) =
    match skind stmt with
    | S_assume e ->
      begin
        let a, bnd = add_missing_vars (a, bnd) (Visitor.expr_vars e) in
        try
          let dnf, (a, bnd), l = bexp_to_vpl e (a, bnd) [] in
          let a' =
            Dnf.reduce_conjunction
              (fun conj ->
                 let tcons_list =
                   List.map
                     (fun (op,e1,e2) ->
                        Vpl__UserInterface.UncertifiedZ.of_cond (IC.Atom (e1, op, e2))
                     ) conj
                 in
                 List.fold_left (fun a cons -> Vpl__UserInterface.UncertifiedZ.assume cons a) a tcons_list
              ) ~join:(Vpl__UserInterface.UncertifiedZ.join) dnf in
          let a', bnd =
            project l a',
            List.fold_left (fun bnd v -> VPLEquiv.remove_r v bnd) bnd l
          in
          Some (a', bnd)
        with ImpreciseExpression -> Some (a, bnd)
      end

    | _ -> assert false



  let rec exec stmt man ctx (a, bnd) =
    match skind stmt with
    | S_add { ekind = E_var (var, _) } when is_var_numeric_type var ->
      add_missing_vars (a,bnd) [var] |> OptionExt.return

    | S_forget { ekind = E_var (var, _) } when is_var_numeric_type var ->
      forget_var var (a, bnd) |>
      OptionExt.return

    | S_remove { ekind = E_var (var, _) } when is_var_numeric_type var ->
      remove_var var (a, bnd) |>
      OptionExt.return

    | S_project vars
      when List.for_all (function { ekind = E_var (v, _) } -> is_var_numeric_type v | _ -> false) vars
      ->
      let vars = List.map (function
          | { ekind = E_var (v, _) } -> v
          | _ -> assert false
        ) vars
      in
      OptionExt.return @@ project_on_vars vars (a, bnd)

    | S_assign({ ekind = E_var (var, mode) }, e) when var_mode var mode = STRONG && is_var_numeric_type var ->
      let a, bnd = add_missing_vars (a,bnd) (var :: (Visitor.expr_vars e)) in
      let v, bnd = mopsa_to_vpl_var var bnd in
      begin try
          let () = debug "bnd = %a" VPLEquiv.print bnd in
          let e, (a, bnd), l = exp_to_vpl e (a,bnd) [] in
          let () = debug "bnd = %a" VPLEquiv.print bnd in
          let a' = assign [(v, e)] a in
          let () = debug "removing temporaries [%a]@\n" (Format.pp_print_list (fun fmt v -> Format.fprintf fmt "%s" (Vpl.Var.to_string v))) l in
          (* let () = debug "%a@\n" (format print_state) (a', bnd) in *)
          (* (fun fmt  v -> pp_var fmt (vpl_to_mopsa_var v bnd))) l in *)
          let a', bnd =
            project l a',
            List.fold_left (fun bnd v -> VPLEquiv.remove_r v bnd) bnd l
          in
          Some (a', bnd)
        with
        | ImpreciseExpression ->
          let () = debug "imprecise expr %a" pp_expr e in
          exec (mk_forget_var var stmt.srange) man ctx (a,bnd)
        (*   | UnsupportedExpression -> *)
        (*     None *)
        end

    | S_assume(e) when is_numeric_type (etyp e) ->
      assume stmt man.ask (a, bnd)

    | S_assign({ ekind = E_var (var, mode) } as lval, e) when var_mode var mode = WEAK && is_var_numeric_type var ->
      let lval' = { lval with ekind = E_var(var, Some STRONG) } in
      let (a, bnd) =
        if VPLEquiv.mem_l var bnd then
          let itv = man.ask (mk_int_interval_query ~fast:true lval) in
          let range = erange lval in
          exec {stmt with skind = S_assume (constraints_of_itv lval' itv range)} man ctx (a, bnd) |> OptionExt.none_to_exn
        else (a, bnd)
      in
      exec {stmt with skind = S_assign(lval', e)} man ctx (a,bnd) |> OptionExt.lift @@ fun (a',bnd') ->
      join (a,bnd) (a', bnd')

    | S_rename ({ ekind = E_var (from, _) }, { ekind = E_var (target, _) })
      when is_var_numeric_type from && is_var_numeric_type target ->
      rename from target (a, bnd)
      |> OptionExt.return

    | S_fold ({ ekind = E_var (from, _) }, [{ ekind = E_var (target, _) }])
      when is_var_numeric_type from && is_var_numeric_type target ->
      (* FIXME: to extend to arbitrary lists through a List.fold *)
      fold from target (a, bnd)
      |> OptionExt.return

    | S_expand ({ ekind = E_var (from, _) }, [{ ekind = E_var (target, _) }])
      when is_var_numeric_type from && is_var_numeric_type target ->
      (* FIXME: to extend to arbitrary lists through a List.fold *)
      expand from target (a, bnd)
      |> OptionExt.return

    | _ -> None

  let vars (abs,bnd) = assert false

  let bound_var v (abs, bnd) =
    if VPLEquiv.mem_l v bnd then
      let vv, _ = mopsa_to_vpl_var v bnd in
      let itv = Vpl__UserInterface.UncertifiedZ.itvize (IT.Var vv) abs in
      (* TODO: I don't get how to represent -infty in bndT? *)
      let open Vpl.Pol in
      let lo, hi = get_low itv, get_up itv in
      let lo = match lo with
        | Infty -> ItvUtils.IntBound.MINF
        | Open r | Closed r ->
                                    (* FIXME *)
          ItvUtils.IntBound.Finite (Z.of_int @@ Q.to_int r)
      in
      let hi = match hi with
        | Infty -> ItvUtils.IntBound.PINF
        | Open r | Closed r ->
                                    (* FIXME *)
          ItvUtils.IntBound.Finite (Z.of_int @@ Q.to_int r)
      in
      ItvUtils.IntItv.of_bound_bot lo hi
    else
      Values.Intervals.Integer.Value.top

  let constraints_of_var vpl_v constraints =
    List.filter (fun cstr ->
        List.exists (fun (vpl_v', c) ->
            (Vpl.Var.cmp vpl_v vpl_v' = 0) && not Vpl.Cstr.Rat.Coeff.(equal c z)
          )
          (Vpl.Vector.Rat.toList (Vpl.Cstr.Rat.get_v cstr))
      ) constraints

  let related_vars v (abs,bnd) =
    let vpl_v, _ = mopsa_to_vpl_var v bnd in
    get_cstrs abs |>
    constraints_of_var vpl_v |>
    List.fold_left (fun acc cstr ->
        List.fold_left (fun acc (vpl_v', c) ->
            if Vpl.Var.cmp vpl_v vpl_v' <> 0 && not Vpl.Cstr.Rat.Coeff.(equal c z) then
              (vpl_to_mopsa_var vpl_v' bnd) :: acc
            else
              acc) acc
          (Vpl.Vector.Rat.toList (Vpl.Cstr.Rat.get_v cstr))
      ) []

  let all_related_vars v a =
    let rec iter acc wq =
      if VarSet.is_empty wq then acc
      else
        let v = VarSet.choose wq in
        let wq = VarSet.remove v wq in
        if VarSet.mem v acc then iter acc wq
        else
          let acc = VarSet.add v acc in
          let related = related_vars v a |> VarSet.of_list in
          let new_related = VarSet.diff related acc in
          let wq = VarSet.union wq new_related in
          iter acc wq
    in
    iter VarSet.empty (VarSet.singleton v) |>
    VarSet.elements



  let ask : type r. ('a,r) query -> ('a,t) simplified_man -> 'a ctx -> t -> r option =
    fun query man ctx (abs,bnd) ->
    match query with
    | Q_avalue({ekind = E_var (v, _)}, Common.V_int_interval) ->
      bound_var v (abs, bnd) |> OptionExt.return

    | Domain.Q_related_vars v ->
      related_vars v (abs,bnd) |>
      OptionExt.return

    (* | Q_constant_vars -> *)
    (*   constant_vars (abs,bnd) |> *)
    (*   OptionExt.return *)

    | _ -> None

  let merge (pre,bnd) ((a1,bnd1),e1) ((a2,bnd2),e2) =
    let bnd = VPLEquiv.concat bnd1 bnd2 in
    let x1,x2 =
      generic_merge
        ~add:(fun v itv x ->
            if is_var_numeric_type v then
              let range = tag_range (Location.R_fresh (-1)) "relational merge" in
              add_missing_vars x [v] |>
              forget_var v |>
              assume (mk_assume (constraints_of_itv (mk_var v range) itv range) range) (fun _ -> assert false) |>
              OptionExt.none_to_exn
            else
              x
          )
        ~find:(fun v x -> bound_var v x)
        ~remove:(fun v x ->
            if is_var_numeric_type v then remove_var v x else x)
        ((a1,bnd),e1) ((a2,bnd),e2)
    in
    let () = Debug.debug ~channel:(name ^ ".merge") "after generic merge@\na1 = %a@\na2 = %a@\nnow meeting results"
        (format print_state) x1
        (format print_state) x2
    in
    meet x1 x2


  let print_expr man ctx a printer exp =
    if exists_expr
        (fun e -> not (is_numeric_type e.etyp))
        (fun s -> false)
        exp
    then ()
    else
      let vars = expr_vars exp |> VarSet.of_list in
      let vars' = VarSet.fold (fun v acc ->
          all_related_vars v a |>
          VarSet.of_list |>
          VarSet.union acc
        ) vars vars in
      match VarSet.elements vars' with
      | [] -> ()
      | l  ->
        match exec (mk_project_vars l exp.erange) man ctx a with
        | None -> ()
        | Some a -> print_state printer a

end

let () =
  Instances.register_instance (module VPL : Instances.RELATIONAL);
  (* Activate VPL as the relational instance (same effect as -numeric vpl
     if the Symbol list still knew about it). *)
  Relational.Instances_choices.enable_rel_domain
    "universal.numeric.relational" true "vpl"

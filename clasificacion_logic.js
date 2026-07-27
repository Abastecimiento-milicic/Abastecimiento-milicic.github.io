window.calculateClassifications = function(o) {

    var clean = (str) => (str ? str.toString().trim() : "");
    var num = (v) => {
        if (!v) return null;
        var parsed = parseFloat(v.toString().replace(',', '.'));
        return isNaN(parsed) ? null : parsed;
    };
    var parseDt = (s) => {
        if(!s) return null;
        var [d, m, y] = s.split('/');
        if(!y) return null;
        if(y.length === 2) y = "20" + y;
        return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    };
    var diffDays = (d1, d2) => {
        if(!d1 || !d2) return null;
        return Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
    };
    
    var claseDoc = o["CLASE DE DOC"];
    var gcOC = o["GRUPO DE COMPRA OC"];
    var estadoItem = o["ESTADO ITEM"];
    var gc = o["GRUPO DE COMPRA"];
    var operadorOC = o["OPERADOR OC"];
    var almacenRecepcion1 = o["ALMACEN RECEPCION 1"];
    var centro = o["CENTRO"];
    var cliente = o["CLIENTE"] || "";
    var operadorPicking = o["OPERADOR PICKING"];
    
    var dtEntregaEsperada = parseDt(o["FECHA ENTREGA ESPERADA"]);
    var dtEmisionNecesidad = parseDt(o["FECHA DE EMISION NECESIDAD"]);
    var difSello = num(o["DIF_ENTREGA_SELLO"]); // wait, DIF_ENTREGA_SELLO might be missing in o!
    var dPlazo = num(o["PLAZO DE ENTREGA"]); 
    
    if (["ZPAN", "ZPAI"].includes(claseDoc) && o["FECHA ENTREGA ESPERADA"] && o["FECHA SELLO"]) {
        difSello = diffDays(parseDt(o["FECHA ENTREGA ESPERADA"]), parseDt(o["FECHA SELLO"]));
    }
    
    if (["ZPAN", "ZPAI"].includes(claseDoc)) {
        var base = o["PRIMERA FECHA ENTREGA OC"] ? parseDt(o["PRIMERA FECHA ENTREGA OC"]) : parseDt(o["FECHA ENTREGA OC"]);
        var adjExpected = null;
        if (dtEntregaEsperada) {
            var pLog = num(o["PLAZO LOGISTICO"]);
            if (pLog === null) adjExpected = dtEntregaEsperada;
            else {
                adjExpected = new Date(dtEntregaEsperada.getTime());
                adjExpected.setDate(adjExpected.getDate() - pLog);
            }
        }
        if (base && adjExpected) dPlazo = diffDays(adjExpected, base);
    }
    
                  

                  
/* duplicated vars removed */

                  
                  var dtEntregaEsperada = parseDt(o["FECHA ENTREGA ESPERADA"]);
                  var dtSello = parseDt(o["FECHA SELLO"]);
                  var dtPrimeraEntregaOC = parseDt(o["PRIMERA FECHA ENTREGA OC"]);
                  var dtEntregaOC = parseDt(o["FECHA ENTREGA OC"]);
                  var dtPicking = parseDt(o["FECHA PICKING"]);
                  var dtEmisionNecesidad = parseDt(o["FECHA DE EMISION NECESIDAD"]);
                  var dtContabVL = parseDt(o["FECHA CONTABILIZACION VL"]);
                  
                  // CARACTER DE GC
                  var caracterGC = "COMPRAS ABASTECIMIENTO";
                  if (claseDoc === "ZPOE" || claseDoc === "ZPOD") caracterGC = "EQUIPOS MENORES";
                  else if (claseDoc === "ZPAS") caracterGC = "ALMACÉN";
                  else if (gcOC === "AGV" || (estadoItem === "SIN TRATAMIENTO" && gc === "AGV") || operadorOC === "ILAHORGUE" || operadorOC === "MRAY") caracterGC = "AGV";
                  else if (["C01","C02","C07"].includes(gcOC) || ["ANAVARRO","BDEGENHART","FROSALES","MCAFFARATTI","MFALERO","GPUJOL","DBENITEZ","CSOSA","PBASILIO","PMATTIUSSI","FZAZZETTI","JAGUERO","DSUAREZ","MSILVA","JIBANEZ","ASIGNORELLI","ARIVERO","FALFARO","GLUNA","JPIEDRABUENA","ASABATINO","JZUVELZA","MALACRAZ","MMHOR","NGONCALVEZ","MREYNA","RTELLO","LCARRIL","CBAREA","ARIVERO","SFERNANDEZ"].includes(operadorOC)) caracterGC = "LOCAL CS";
                  else if (["C03","C04","C29","C37","C38","C39","C40","C41","C42","C43","C44","C45","C46","C47","C48","C49","C50","C51","C52","C53","C54","F01","F02","F03","F04","F05","F06","F07","F08","F09","F10","F11","F12","F13","F14","G01","G02","G03","G04","G05","G06","L01","L02","L03","L04","CGT","EFO"].includes(gcOC) || (estadoItem === "SIN TRATAMIENTO" && ["C03","C04","C29","C37","C38","C39","C40","C41","C42","C43","C44","C45","C46","C47","C48","C49","C50","C51","C52","C53","C54","F01","F02","F03","F04","F05","F06","F07","F08","F09","F10","F11","F12","F13","F14","G01","G02","G03","G04","G05","G06","L01","L02","L03","L04","CGT","EFO"].includes(gc))) caracterGC = "EQUIPOS";
                  o["CARACTER DE GC"] = caracterGC;

                  // CARACTER ALMACEN RECEPCION 1
                  var carAlm = "PROYECTO";
                  if ((almacenRecepcion1 === "2001" && centro === "MR01") || almacenRecepcion1 === "UT08" || almacenRecepcion1 === "MM08") carAlm = "TRANSITORIO ROSARIO";
                  else if ((almacenRecepcion1 === "2001" && centro === "MM01") || almacenRecepcion1 == "1200" || almacenRecepcion1 === "UT07" || almacenRecepcion1 === "MR07") carAlm = "TRANSITORIO SAN JUAN";
                  else if ((almacenRecepcion1 === "2000" && centro === "MR01") || almacenRecepcion1 === "3000") carAlm = "DEFINITIVO ROSARIO";
                  else if ((almacenRecepcion1 === "2000" && centro === "MM01") || almacenRecepcion1 === "1000") carAlm = "DEFINITIVO SAN JUAN";
                  else if (almacenRecepcion1 === "2200" || almacenRecepcion1 === "3200") carAlm = "TRANSITORIO STOCK";
                  o["CARACTER ALMACEN RECEPCION 1"] = carAlm;

                  // CLI
                  var cli = null;
                  var cUp = cliente.trim().toUpperCase();
                  if (cUp === "00029-AMPLIACION SEDE ROSARIO") cli = "00029MR";
                  else if (cUp === "00029 -AMPLIACION SEDE SJ") cli = "00029MM";
                  else if (cUp === "PROYECTO 371 VELADERO F8A") cli = "00371";
                  else if (cUp === "OBRA 374 TERMINAL PUNTA COLORADA") cli = "00374";
                  else if (cUp === "00375 YPF OLEODUCTO PR-LP") cli = "00375";
                  else if (cUp === "UTE 348" || cUp === "UTE 363") cli = cUp;
                  else {
                      var tokens = cUp.split(/[ \-\/\(\),]+/);
                      var digitTokens = tokens.map(t => t.replace(/\D/g, '')).filter(t => t);
                      if (digitTokens.length > 0) cli = digitTokens[0].padStart(5, '0');
                  }
                  o["CLI"] = cli;

                  // DIF_ENTREGA_SELLO
                  var difSello = null;
                  if ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && dtEntregaEsperada && dtSello) difSello = diffDays(dtEntregaEsperada, dtSello);
                  o["DIF_ENTREGA_SELLO"] = difSello;

                  // dPLAZO DE ENTREGA
                  var dPlazo = null;
                  if (claseDoc === "ZPAN" || claseDoc === "ZPAI") {
                      var base = dtPrimeraEntregaOC || dtEntregaOC;
                      var adjExpected = dtEntregaEsperada;
                      if (dtEntregaEsperada && o["PLAZO LOGISTICO"]) {
                          adjExpected = new Date(dtEntregaEsperada);
                          adjExpected.setDate(adjExpected.getDate() - parseInt(o["PLAZO LOGISTICO"]));
                      }
                      if (base && adjExpected) dPlazo = diffDays(adjExpected, base);
                  }
                  o["dPLAZO DE ENTREGA"] = dPlazo;

                  // OPERADOR PICKING
                  o["OPERADOR PICKING ROSARIO"] = ["BCALGARO","PAPPELLA","ACAPIGLIONI","CPETROCCHI","EJUAREZ","FDEICAS","JBIONDI","JCHAVEZ","FGORGONA","JMORENO","WPUCHETA","ALANDAVIDEA","LNASUTTI","LBARTON","CCARRIL"].includes(operadorPicking) ? 1 : (operadorPicking ? 0 : null);
                  o["OPERADOR PICKING SJ"] = ["JCALO","MLARRETA","MTORRES","FVEDIA","MMORALES","MRIVEROS","AITURRIERA","SMANTINEO","LMALDONADO","ERUARTE","ERODRIGUEZ","FGONZALEZ","OROBLES","GQUIROGA"].includes(operadorPicking) ? 1 : (operadorPicking ? 0 : null);

                  // dTRANSPORTEyALM
                  var dTrans = null;
                  if ((claseDoc === "ZPOE" || claseDoc === "ZPOD") && dtContabVL && dtPicking) dTrans = diffDays(dtContabVL, dtPicking);
                  o["dTRANSPORTEyALM"] = dTrans;

                    // dALMACEN (Dynamic calculations based on dates)
                    var regRec = 0;
                    if (["ZPAN","ZPAI"].includes(claseDoc) && o["FECHA RECEPCION"] && o["FECHA SELLO"]) {
                        var val = diffDays(parseDt(o["FECHA RECEPCION"]), parseDt(o["FECHA SELLO"]));
                        if (val !== null) regRec = val;
                    }
                    
                    var pick = 0;
                    if (["ZPAN","ZPAI"].includes(claseDoc) && o["FECHA PICKING"] && o["FECHA RECEPCION"]) {
                        var val = diffDays(parseDt(o["FECHA PICKING"]), parseDt(o["FECHA RECEPCION"]));
                        if (val !== null) pick = val;
                    } else if (claseDoc === "ZPAS" && o["FECHA PICKING"] && o["FECHA DE EMISION NECESIDAD"]) {
                        var val = diffDays(parseDt(o["FECHA PICKING"]), parseDt(o["FECHA DE EMISION NECESIDAD"]));
                        if (val !== null) pick = val;
                    }
                    
                    var emb = 0;
                    if (["ZPAN","ZPAI","ZPAS"].includes(claseDoc) && o["FECHA DE CARGA"] && o["FECHA PICKING"]) {
                        var val = diffDays(parseDt(o["FECHA DE CARGA"]), parseDt(o["FECHA PICKING"]));
                        if (val !== null) emb = val;
                    }
                    
                    o["dALMACEN"] = regRec + pick + emb;

                  // COLOCACION OC SEDE
                  var dColOC = num(o["COLOCACION OC"]);
                  if ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "COMPRAS ABASTECIMIENTO" && o["COLOCACION OC"] && ((claseDoc === "ZPAN" && dColOC > 5) || (claseDoc === "ZPAI" && dColOC > 2))) o["COLOCACION OC SEDE"] = (claseDoc === "ZPAN") ? dColOC - 5 : dColOC - 2;
                  else o["COLOCACION OC SEDE"] = null;

                  // LIBERACION OC SEDE
                  var dTiApro = num(o["TIEMPOS DE APROBACION OC"]);
                  o["LIBERACION OC SEDE"] = ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "COMPRAS ABASTECIMIENTO" && o["TIEMPOS DE APROBACION OC"] && dTiApro > 2) ? dTiApro - 2 : null;

                  // ENTREGA DEL PROVEEDOR SEDE
                  o["ENTREGA DEL PROVEEDOR SEDE"] = ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "COMPRAS ABASTECIMIENTO" && difSello !== null && difSello < 0) ? Math.abs(difSello) : null;

                  // PLAZO DE ENTREGA EXCEDIDO SEDE
                  o["PLAZO DE ENTREGA EXCEDIDO SEDE"] = (caracterGC === "COMPRAS ABASTECIMIENTO" && dPlazo !== null && dPlazo < 0) ? Math.abs(dPlazo) : null;

                  // COLOCACION OC EQUIPOS
                  if ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "EQUIPOS" && o["COLOCACION OC"] && ((claseDoc === "ZPAN" && dColOC > 5) || (claseDoc === "ZPAI" && dColOC > 2))) o["COLOCACION OC EQUIPOS"] = (claseDoc === "ZPAN") ? dColOC - 5 : dColOC - 2;
                  else o["COLOCACION OC EQUIPOS"] = null;

                  // LIBERACION OC EQUIPOS
                  o["LIBERACION OC EQUIPOS"] = ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "EQUIPOS" && o["TIEMPOS DE APROBACION OC"] && dTiApro > 2) ? dTiApro - 2 : null;

                  // ENTREGA DEL PROVEEDOR EQUIPOS
                  o["ENTREGA DEL PROVEEDOR EQUIPOS"] = ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "EQUIPOS" && difSello !== null && difSello < 0) ? Math.abs(difSello) : null;

                  // PLAZO DE ENTREGA EXCEDIDO EQUIPOS
                  o["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] = (caracterGC === "EQUIPOS" && dPlazo !== null && dPlazo < 0) ? Math.abs(dPlazo) : null;

                  // COLOCACION OC AGV
                  if ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "AGV" && o["COLOCACION OC"] && ((claseDoc === "ZPAN" && dColOC > 5) || (claseDoc === "ZPAI" && dColOC > 2))) o["COLOCACION OC AGV"] = (claseDoc === "ZPAN") ? dColOC - 5 : dColOC - 2;
                  else o["COLOCACION OC AGV"] = null;

                  // LIBERACION OC AGV
                  o["LIBERACION OC AGV"] = ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "AGV" && o["TIEMPOS DE APROBACION OC"] && dTiApro > 2) ? dTiApro - 2 : null;

                  // ENTREGA DEL PROVEEDOR AGV
                  o["ENTREGA DEL PROVEEDOR AGV"] = ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && caracterGC === "AGV" && difSello !== null && difSello < 0) ? Math.abs(difSello) : null;

                  // PLAZO DE ENTREGA EXCEDIDO AGV
                  o["PLAZO DE ENTREGA EXCEDIDO AGV"] = (caracterGC === "AGV" && dPlazo !== null && dPlazo < 0) ? Math.abs(dPlazo) : null;

                  // ALMACEN ROSARIO
                  var dAlm = o["dALMACEN"];
                  if ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && carAlm === "TRANSITORIO ROSARIO" && dAlm > 4) o["ALMACEN ROSARIO"] = dAlm - 4;
                  else if (claseDoc === "ZPAS" && o["OPERADOR PICKING ROSARIO"] === 1 && dAlm > 8) o["ALMACEN ROSARIO"] = dAlm - 8;
                  else o["ALMACEN ROSARIO"] = null;

                  // ALMACEN SAN JUAN
                  if ((claseDoc === "ZPAN" || claseDoc === "ZPAI") && carAlm === "TRANSITORIO SAN JUAN" && dAlm > 4) o["ALMACEN SAN JUAN"] = dAlm - 4;
                  else if (claseDoc === "ZPAS" && o["OPERADOR PICKING SJ"] === 1 && dAlm > 8) o["ALMACEN SAN JUAN"] = dAlm - 8;
                  else o["ALMACEN SAN JUAN"] = null;

                    // dEXPEDICION
                    var dExp = null;
                    if (["ZPAN","ZPAI","ZPAS"].includes(claseDoc) && o["FECHA CONTABILIZACION VL"] && o["FECHA DE CARGA"]) {
                        var dtContab = parseDt(o["FECHA CONTABILIZACION VL"]);
                        var dtCarga = parseDt(o["FECHA DE CARGA"]);
                        if (dtContab && dtCarga) dExp = diffDays(dtContab, dtCarga);
                    }
                    if (dExp === null) dExp = num(o["dEXPEDICION"]);
                    o["dEXPEDICION"] = dExp; // Update value so EXPEDICION CS can use it

                  // dPREPARACION
                  var dPrep = null;
                  if ((claseDoc === "ZPOE" || claseDoc === "ZPOD") && dtPicking && dtEmisionNecesidad) dPrep = diffDays(dtPicking, dtEmisionNecesidad);
                  o["dPREPARACION"] = dPrep;

                  // PREPARACION
                  o["PREPARACION"] = (dPrep !== null && dPrep > 2) ? dPrep - 2 : null;

                  // TRANSPORTEyALM
                  var dTra = dTrans;
                  var c = cli;
                  if (dTra === null) o["TRANSPORTEyALM"] = null;
                  else if (c === "00038" && dTra > 10) o["TRANSPORTEyALM"] = dTra - 10;
                  else if (c === "00223" && dTra > 16) o["TRANSPORTEyALM"] = dTra - 16;
                  else if (c === "00357" && dTra > 5) o["TRANSPORTEyALM"] = dTra - 5;
                  else if (c === "00359" && dTra > 5) o["TRANSPORTEyALM"] = dTra - 5;
                  else if (c === "00341" && dTra > 21) o["TRANSPORTEyALM"] = dTra - 21;
                  else if (c === "00314" && dTra > 11) o["TRANSPORTEyALM"] = dTra - 11;
                  else if (c === "UTE 363" && dTra > 14) o["TRANSPORTEyALM"] = dTra - 14;
                  else if (c === "00364" && dTra > 10) o["TRANSPORTEyALM"] = dTra - 10;
                  else if (c === "00029MM" && dTra > 5) o["TRANSPORTEyALM"] = dTra - 5;
                  else if (c === "00029MR" && dTra > 5) o["TRANSPORTEyALM"] = dTra - 5;
                  else if (c === "00298" && dTra > 12) o["TRANSPORTEyALM"] = dTra - 12;
                  else if (c === "00365" && dTra > 16) o["TRANSPORTEyALM"] = dTra - 16;
                  else if (c === "00367" && dTra > 25) o["TRANSPORTEyALM"] = dTra - 25;
                  else if (c === "00369" && dTra > 15) o["TRANSPORTEyALM"] = dTra - 15;
                  else if (c === "00371" && dTra > 5) o["TRANSPORTEyALM"] = dTra - 5;
                  else if (c === "00372" && dTra > 16) o["TRANSPORTEyALM"] = dTra - 16;
                  else if (c === "00374" && dTra > 15) o["TRANSPORTEyALM"] = dTra - 15;
                  else if (c === "00375" && dTra > 14) o["TRANSPORTEyALM"] = dTra - 14;
                  else if (c === "00376" && dTra > 12) o["TRANSPORTEyALM"] = dTra - 12;
                  else if (c === "00368" && dTra > 7) o["TRANSPORTEyALM"] = dTra - 7;
                  else if (c === "00377" && dTra > 12) o["TRANSPORTEyALM"] = dTra - 12;
                  else o["TRANSPORTEyALM"] = null;

                  // LIBERACION SOLPED CS
                  var dTiAproSol = num(o["TIEMPO DE APROBACION SOLPED"]);
                  o["LIBERACION SOLPED CS"] = (["ZPAN","ZPAI","ZPAS"].includes(claseDoc) && o["TIEMPO DE APROBACION SOLPED"] && dTiAproSol > 2) ? dTiAproSol - 2 : null;

                  // FECHAENTREGAMUYCERCANA
                  var dExpEmis = null;
                  if (dtEntregaEsperada && dtEmisionNecesidad) dExpEmis = diffDays(dtEntregaEsperada, dtEmisionNecesidad);
                  var muyCercana = null;
                  if (dExpEmis !== null) {
                      if (["ZPOE","ZPAS"].includes(claseDoc)) {
                          if (c === "00038" && dExpEmis <= 12) muyCercana = 1;
                          else if (c === "00223" && dExpEmis < 16) muyCercana = 1;
                          else if (c === "00357" && dExpEmis < 5) muyCercana = 1;
                          else if (c === "00359" && dExpEmis < 5) muyCercana = 1;
                          else if (c === "00341" && dExpEmis < 21) muyCercana = 1;
                          else if (c === "00314" && dExpEmis < 16) muyCercana = 1;
                          else if (c === "UTE 363" && dExpEmis < 14) muyCercana = 1;
                          else if (c === "00364" && dExpEmis < 23) muyCercana = 1;
                          else if (c === "00029MM" && dExpEmis < 5) muyCercana = 1;
                          else if (c === "00029MR" && dExpEmis < 5) muyCercana = 1;
                          else if (c === "00298" && dExpEmis < 23) muyCercana = 1;
                          else if (c === "00365" && dExpEmis < 20) muyCercana = 1;
                          else if (c === "00367" && dExpEmis < 25) muyCercana = 1;
                          else if (c === "00369" && dExpEmis < 16) muyCercana = 1;
                          else if (c === "00371" && dExpEmis < 12) muyCercana = 1;
                          else if (c === "00372" && dExpEmis < 20) muyCercana = 1;
                          else if (c === "00374" && dExpEmis < 22) muyCercana = 1;
                          else if (c === "00375" && dExpEmis < 14) muyCercana = 1;
                          else if (c === "00376" && dExpEmis < 13) muyCercana = 1;
                          else if (c === "00368" && dExpEmis < 13) muyCercana = 1;
                          else if (c === "00377" && dExpEmis < 13) muyCercana = 1;
                      } else if (["ZPAN","ZPAI"].includes(claseDoc)) {
                          if (c === "00038" && dExpEmis <= 8) muyCercana = 1;
                          else if (c === "00223" && dExpEmis <= 12) muyCercana = 1;
                          else if (c === "00357" && dExpEmis <= 5) muyCercana = 1;
                          else if (c === "00359" && dExpEmis <= 5) muyCercana = 1;
                          else if (c === "00341" && dExpEmis <= 17) muyCercana = 1;
                          else if (c === "00314" && dExpEmis <= 12) muyCercana = 1;
                          else if (c === "UTE 363" && dExpEmis <= 14) muyCercana = 1;
                          else if (c === "00364" && dExpEmis <= 19) muyCercana = 1;
                          else if (c === "00029MM" && dExpEmis <= 5) muyCercana = 1;
                          else if (c === "00029MR" && dExpEmis <= 5) muyCercana = 1;
                          else if (c === "00298" && dExpEmis <= 19) muyCercana = 1;
                          else if (c === "00365" && dExpEmis <= 16) muyCercana = 1;
                          else if (c === "00367" && dExpEmis <= 21) muyCercana = 1;
                          else if (c === "00369" && dExpEmis <= 12) muyCercana = 1;
                          else if (c === "00371" && dExpEmis <= 8) muyCercana = 1;
                          else if (c === "00372" && dExpEmis <= 16) muyCercana = 1;
                          else if (c === "00374" && dExpEmis <= 18) muyCercana = 1;
                          else if (c === "00375" && dExpEmis <= 10) muyCercana = 1;
                          else if (c === "00376" && dExpEmis <= 8) muyCercana = 1;
                          else if (c === "00368" && dExpEmis <= 8) muyCercana = 1;
                          else if (c === "00377" && dExpEmis < 13) muyCercana = 1;
                      }
                  }
                  o["FECHAENTREGAMUYCERCANA"] = muyCercana;

                  // COLOCACION OC CS
                  if (caracterGC === "LOCAL CS" && claseDoc === "ZPAN" && o["COLOCACION OC"] && dColOC > 5) o["COLOCACION OC CS"] = dColOC - 5;
                  else if (caracterGC === "LOCAL CS" && claseDoc === "ZPAI" && o["COLOCACION OC"] && dColOC > 2) o["COLOCACION OC CS"] = dColOC - 2;
                  else o["COLOCACION OC CS"] = null;

                  // LIBERACION OC CS
                  o["LIBERACION OC CS"] = (["ZPAN","ZPAI"].includes(claseDoc) && caracterGC === "LOCAL CS" && o["TIEMPOS DE APROBACION OC"] && dTiApro > 2) ? dTiApro - 2 : null;

                  // ENTREGA DEL PROVEEDOR CS
                  o["ENTREGA DEL PROVEEDOR CS"] = (["ZPAN","ZPAI"].includes(claseDoc) && caracterGC === "LOCAL CS" && difSello !== null && difSello < 0) ? Math.abs(difSello) : null;

                  // PLAZO DE ENTREGA EXCEDIDO CS
                  o["PLAZO DE ENTREGA EXCEDIDO CS"] = (caracterGC === "LOCAL CS" && dPlazo !== null && dPlazo < 0) ? Math.abs(dPlazo) : null;

                  // CLASIFICACIONES DE AREA
                  var sumCols = (cols) => {
                      var s = 0;
                      var hasVal = false;
                      for (var c of cols) {
                          if (o[c] !== null && o[c] !== undefined) {
                              s += num(o[c]);
                              hasVal = true;
                          }
                      }
                      return hasVal ? s : null;
                  };

                  var sc = sumCols(["COLOCACION OC SEDE","LIBERACION OC SEDE","ENTREGA DEL PROVEEDOR SEDE","PLAZO DE ENTREGA EXCEDIDO SEDE"]);
                  o["COMPRAS"] = (sc !== null && sc > 0) ? 1 : null;

                  var sce = sumCols(["COLOCACION OC EQUIPOS","LIBERACION OC EQUIPOS","ENTREGA DEL PROVEEDOR EQUIPOS","PLAZO DE ENTREGA EXCEDIDO EQUIPOS"]);
                  o["COMPRAS EQUIPOS"] = (sce !== null && sce > 0) ? 1 : null;

                  var sca = sumCols(["COLOCACION OC AGV","LIBERACION OC AGV","ENTREGA DEL PROVEEDOR AGV","PLAZO DE ENTREGA EXCEDIDO AGV"]);
                  o["COMPRAS AGV"] = (sca !== null && sca > 0) ? 1 : null;

                  var salm = sumCols(["ALMACEN ROSARIO", "ALMACEN SAN JUAN"]);
                  o["ALMACÉN"] = (salm !== null && salm > 0) ? 1 : null;
                  if (o["ALMACÉN"] === 1) { o["ALMACEN"] = 1; o["ALMACN"] = 1; }

                  var seq = sumCols(["PREPARACION", "TRANSPORTEyALM"]);
                  o["EQUIPOS MENORES"] = (seq !== null && seq > 0) ? 1 : null;

                  var sproy = sumCols(["LIBERACION SOLPED CS", "FECHAENTREGAMUYCERCANA", "COLOCACION OC CS", "LIBERACION OC CS", "ENTREGA DEL PROVEEDOR CS", "PLAZO DE ENTREGA EXCEDIDO CS"]);
                  o["PROYECTO"] = (sproy !== null && sproy > 0) ? 1 : null;

                  // --- LÓGICA BLEND ---
                  var dExpedicion = null;
                  var dTrans = num(o["dTRASLADO"]);
                  if (dTrans === null && ["ZPAN","ZPAI","ZPAS"].includes(claseDoc) && o["FECHA CONTABILIZACION VL"]) {
                      var dtAlmacenamiento = parseDt(o["FECHA DE ALMACENAMIENTO SELLO"]) || parseDt(o["FECHA ALMACENAMIENTO (LOGIN)"]);
                      if (dtAlmacenamiento) {
                          dTrans = diffDays(dtAlmacenamiento, parseDt(o["FECHA CONTABILIZACION VL"]));
                          o["dTRASLADO"] = dTrans;
                      }
                  }

                  if (["ZPAN","ZPAI","ZPAS"].includes(claseDoc) && o["FECHA CONTABILIZACION VL"] && o["FECHA DE CARGA"]) {
                      dExpedicion = diffDays(parseDt(o["FECHA CONTABILIZACION VL"]), parseDt(o["FECHA DE CARGA"]));
                  }
                  
                  var expedicionCS = (dExpedicion !== null && dExpedicion > 2) ? 1 : null;
                  o["dEXPEDICION"] = dExpedicion;
                  o["EXCESO EXPEDICION CS"] = (dExpedicion !== null && dExpedicion > 2) ? dExpedicion - 2 : null;
                  
                  // TRASLADO CS
                  var trasladoCS = null;
                  var valTra_final = null;
                  if (dTrans !== null && c !== null) {
                      var valTra = null;
                      if (c === "00038" && dTrans > 1) valTra = dTrans - 1;
                      else if (c === "00223" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "00357" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "00359" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "00341" && dTrans > 10) valTra = dTrans - 10;
                      else if (c === "00314" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "UTE 363" && dTrans > 14) valTra = dTrans - 14;
                      else if (c === "00364" && dTrans > 12) valTra = dTrans - 12;
                      else if (c === "00029MM" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "00029MR" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "00298" && dTrans > 12) valTra = dTrans - 12;
                      else if (c === "00365" && dTrans > 9) valTra = dTrans - 9;
                      else if (c === "00367" && dTrans > 14) valTra = dTrans - 14;
                      else if (c === "00369" && dTrans > 5) valTra = dTrans - 5;
                      else if (c === "00371" && dTrans > 1) valTra = dTrans - 1;
                      else if (c === "00372" && dTrans > 9) valTra = dTrans - 9;
                      else if (c === "00374" && dTrans > 11) valTra = dTrans - 11;
                      else if (c === "00375" && dTrans > 3) valTra = dTrans - 3;
                      else if (c === "00376" && dTrans > 2) valTra = dTrans - 2;
                      else if (c === "00368" && dTrans > 2) valTra = dTrans - 2;
                      else if (c === "00377" && dTrans > 2) valTra = dTrans - 2;
                      
                      if (valTra !== null) {
                          trasladoCS = 1;
                          valTra_final = valTra;
                      }
                  }
                  
                  o["EXCESO TRASLADO CS"] = valTra_final;
                  
                  var sumBlend = 0;
                  var hasBlend = false;
                  if (trasladoCS !== null) { sumBlend += trasladoCS; hasBlend = true; }
                  if (expedicionCS !== null) { sumBlend += expedicionCS; hasBlend = true; }
                  
                  o["BLEND"] = (hasBlend && sumBlend > 0) ? 1 : null;

                  // Guardar si por fórmula no tuvo ninguna clasificación de área antes del fallback del KPI
                  var hasNumericArea = (o["COMPRAS"] > 0 || o["ALMACÉN"] > 0 || o["PROYECTO"] > 0 || o["EQUIPOS MENORES"] > 0 || o["COMPRAS EQUIPOS"] > 0 || o["COMPRAS AGV"] > 0 || o["BLEND"] > 0);
                  o["SIN_CLASIFICAR_FORMULA"] = !hasNumericArea ? 1 : null;

                  // ============================================
                  // FALLBACK PARA CUADRAR CON EL KPI 10699
                  // ============================================
                  var ft_val = num(o["ENTREGADOS FT"]);
                  if (ft_val > 0) {
                      var hasArea = hasNumericArea;
                      if (!hasArea) {
                          if (caracterGC === "COMPRAS ABASTECIMIENTO" || caracterGC === "COMPRAS") o["COMPRAS"] = 1;
                          else if (caracterGC === "ALMACÉN" || caracterGC === "ALMACEN" || caracterGC === "ALMACN") { o["ALMACÉN"] = 1; o["ALMACEN"] = 1; o["ALMACN"] = 1; }
                          else if (caracterGC === "EQUIPOS MENORES") o["EQUIPOS MENORES"] = 1;
                          else if (caracterGC === "EQUIPOS") o["COMPRAS EQUIPOS"] = 1;
                          else if (caracterGC === "AGV") o["COMPRAS AGV"] = 1;
                          else if (caracterGC === "LOCAL CS") o["PROYECTO"] = 1;
                          else if (caracterGC === "BLEND") o["BLEND"] = 1;
                      }
                  }

                  if (o["ALMACÉN"] == 1 || o["ALMACEN"] == 1 || o["ALMACN"] == 1) {
                      o["ALMACÉN"] = 1; o["ALMACEN"] = 1; o["ALMACN"] = 1;
                  }

                  // =========================================================================
                  // RELLENADO DE DEMORAS (FALLBACK VISUAL) PARA TODAS LAS CATEGORÍAS
                  // =========================================================================
                  var calcColOC = () => {
                      if (o["COLOCACION OC CS"] || o["COLOCACION OC SEDE"] || o["COLOCACION OC EQUIPOS"] || o["COLOCACION OC AGV"]) return o["COLOCACION OC CS"] || o["COLOCACION OC SEDE"] || o["COLOCACION OC EQUIPOS"] || o["COLOCACION OC AGV"];
                      if (claseDoc === "ZPAN" && o["COLOCACION OC"] && dColOC > 5) return dColOC - 5;
                      if (claseDoc === "ZPAI" && o["COLOCACION OC"] && dColOC > 2) return dColOC - 2;
                      return null;
                  };
                  var calcLibOC = () => {
                      if (o["LIBERACION OC CS"] || o["LIBERACION OC SEDE"] || o["LIBERACION OC EQUIPOS"] || o["LIBERACION OC AGV"]) return o["LIBERACION OC CS"] || o["LIBERACION OC SEDE"] || o["LIBERACION OC EQUIPOS"] || o["LIBERACION OC AGV"];
                      if (["ZPAN","ZPAI"].includes(claseDoc) && o["TIEMPOS DE APROBACION OC"] && dTiApro > 2) return dTiApro - 2;
                      return null;
                  };
                  var calcProv = () => {
                      if (o["ENTREGA DEL PROVEEDOR CS"] || o["ENTREGA DEL PROVEEDOR SEDE"] || o["ENTREGA DEL PROVEEDOR EQUIPOS"] || o["ENTREGA DEL PROVEEDOR AGV"]) return o["ENTREGA DEL PROVEEDOR CS"] || o["ENTREGA DEL PROVEEDOR SEDE"] || o["ENTREGA DEL PROVEEDOR EQUIPOS"] || o["ENTREGA DEL PROVEEDOR AGV"];
                      if (difSello !== null && difSello < 0) return Math.abs(difSello);
                      return null;
                  };
                  var calcPlazo = () => {
                      if (o["PLAZO DE ENTREGA EXCEDIDO CS"] || o["PLAZO DE ENTREGA EXCEDIDO SEDE"] || o["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] || o["PLAZO DE ENTREGA EXCEDIDO AGV"]) return o["PLAZO DE ENTREGA EXCEDIDO CS"] || o["PLAZO DE ENTREGA EXCEDIDO SEDE"] || o["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] || o["PLAZO DE ENTREGA EXCEDIDO AGV"];
                      if (dPlazo !== null && dPlazo < 0) return Math.abs(dPlazo);
                      return null;
                  };

                  if (o["PROYECTO"] === 1) {
                      if (o["COLOCACION OC CS"] == null) o["COLOCACION OC CS"] = calcColOC();
                      if (o["LIBERACION OC CS"] == null) o["LIBERACION OC CS"] = calcLibOC();
                      if (o["ENTREGA DEL PROVEEDOR CS"] == null) o["ENTREGA DEL PROVEEDOR CS"] = calcProv();
                      if (o["PLAZO DE ENTREGA EXCEDIDO CS"] == null) o["PLAZO DE ENTREGA EXCEDIDO CS"] = calcPlazo();
                  }
                  if (o["COMPRAS"] === 1) {
                      if (o["COLOCACION OC SEDE"] == null) o["COLOCACION OC SEDE"] = calcColOC();
                      if (o["LIBERACION OC SEDE"] == null) o["LIBERACION OC SEDE"] = calcLibOC();
                      if (o["ENTREGA DEL PROVEEDOR SEDE"] == null) o["ENTREGA DEL PROVEEDOR SEDE"] = calcProv();
                      if (o["PLAZO DE ENTREGA EXCEDIDO SEDE"] == null) o["PLAZO DE ENTREGA EXCEDIDO SEDE"] = calcPlazo();
                  }
                  if (o["COMPRAS EQUIPOS"] === 1) {
                      if (o["COLOCACION OC EQUIPOS"] == null) o["COLOCACION OC EQUIPOS"] = calcColOC();
                      if (o["LIBERACION OC EQUIPOS"] == null) o["LIBERACION OC EQUIPOS"] = calcLibOC();
                      if (o["ENTREGA DEL PROVEEDOR EQUIPOS"] == null) o["ENTREGA DEL PROVEEDOR EQUIPOS"] = calcProv();
                      if (o["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] == null) o["PLAZO DE ENTREGA EXCEDIDO EQUIPOS"] = calcPlazo();
                  }
                  if (o["COMPRAS AGV"] === 1) {
                      if (o["COLOCACION OC AGV"] == null) o["COLOCACION OC AGV"] = calcColOC();
                      if (o["LIBERACION OC AGV"] == null) o["LIBERACION OC AGV"] = calcLibOC();
                      if (o["ENTREGA DEL PROVEEDOR AGV"] == null) o["ENTREGA DEL PROVEEDOR AGV"] = calcProv();
                      if (o["PLAZO DE ENTREGA EXCEDIDO AGV"] == null) o["PLAZO DE ENTREGA EXCEDIDO AGV"] = calcPlazo();
                  }
                  if (o["ALMACÉN"] === 1 || o["ALMACEN"] === 1 || o["ALMACN"] === 1) {
                      if (o["ALMACEN ROSARIO"] == null && o["ALMACEN SAN JUAN"] == null) {
                          var dAlmVal = o["dALMACEN"];
                          if (dAlmVal > 4) {
                              if (carAlm && String(carAlm).toUpperCase().includes("SAN JUAN")) o["ALMACEN SAN JUAN"] = dAlmVal - 4;
                              else o["ALMACEN ROSARIO"] = dAlmVal - 4;
                          }
                      }
                  }
                  if (o["EQUIPOS MENORES"] === 1) {
                      if (o["PREPARACION"] == null && num(o["dPREPARACION"]) > 0) o["PREPARACION"] = num(o["dPREPARACION"]);
                      if (o["TRANSPORTEyALM"] == null && num(o["dTRANSPORTEyALM"]) > 0) o["TRANSPORTEyALM"] = num(o["dTRANSPORTEyALM"]);
                  }
                  if (o["BLEND"] === 1) {
                      if (o["EXCESO EXPEDICION CS"] == null && o["EXPEDICION CS"] != null) o["EXCESO EXPEDICION CS"] = o["EXPEDICION CS"];
                      if (o["EXCESO TRASLADO CS"] == null && o["TRASLADO CS"] != null) o["EXCESO TRASLADO CS"] = o["TRASLADO CS"];
                  }
                  
  return o;
};

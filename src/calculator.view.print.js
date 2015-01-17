﻿//
// Sample Preparation Calculator
// Print view
//
// (c) 2013 Pacific Biosciences
//

/*jslint maxlen: 150 */
/*global $, _, Backbone*/

//
// Based upon what is selected in the list view, display print view
// - take names list of samples as before, but through routes
// - have list view construct URI from selected sample names as before
// - redirect to route for #print/names
// - use special print model for the samples to compute sections with master mixes
// - special view modules then populate rows of the final table from that model
// - could implement this before samples are computed entirely in browser, since
//      the per sample details are available already and cached, should be quick
//

var PrintView = Backbone.View.extend({
    model: undefined,
    constants: undefined,
    samples: undefined,

    initialize: function (options) {
        var that = this;
        this.model = options.model;
        this.constants = options.constants;

        this.model.on('loaded', function () {
            that.loaded();
        });
        this.model.on('loading', function (status) {
            // as we load things from localstorage or the RS instrument we get
            // these status updates. could use them to display progress if it
            // takes a long time, or update a progress bar
            // alert("tbd: loading " + status.finished + " of " + status.of);
        });
    },

    loaded: function () {
        // called once the model is ready, we can render now.

        var template, mismatched,
            that = this,
            sections = {};

        this.samples = this.model.fetched;

        sections.SampleDetailsTable = this.sampleDetailsTable();
        sections.Errors = this.errorsSection();

        _.templateSettings = {
            evaluate: /\{\{(.+?)\}\}/g,
            interpolate: /\{\{=(.+?)\}\}/g,
            escape: /\{\{-(.+?)\}\}/g
        };

        template = _.template($('#print-view-template-top').html(), {
            strings: that.constants.strings,
            section: sections
        });

        this.someSampleUsesSpike = this.anyUseSpike();
        mismatched = this.mismatchedTypeError();
        if ("" !== mismatched) {
            //
            // Sorry, cannot display these samples together. Display why.
            //

            template += "<h4 style='color: red; margin-top:2em; max-width: 480px'>" + mismatched + "</h4>";
        } else {
            //
            // Else fill in the rest of the templates and append including master mixes
            //

            sections.AnnealingSequencingPrimerDilution = this.annealingSequencingPrimerDilution();
            sections.AnnealingRecipeTable = this.annealingRecipeTable();
            sections.DilutionTable = this.dilutionTable();
            sections.BindingPolymeraseTable = this.bindingPolymeraseTable();
            sections.showLongTermStorage = this.anyLongTermStorage();
            sections.LongTermStorage = this.longTermStorage();
            sections.showTitrations = this.anyTitrations();
            sections.LoadingTitrationTable = this.loadingTitrationTable();
            sections.UsingBoundComplexTable = this.usingBoundComplexTable();
            sections.PlateLayout = this.plateLayout();
            sections.Step8 = this.Step8Text();
            sections.Step9 = this.Step9Text();

            template += _.template($('#print-view-details').html(), {
                strings: that.constants.strings,
                samples: that.samples,
                sections: sections
            });
        }

        // toggle our css rules and prep the template
        // note render() should have turned our background white for us already
        this.$el.hide().html(template).prop("id", "printview");

        //
        // alternate grey backgrounds on tables, for readability
        //

        $('table tr:odd').not('#print-options tr').not('.columnheader').css("background-color", "rgb(245, 245, 245)");

        //
        // page breaks, when selected the potential_page_break class is also a page_break class
        // which causes a CSS2 page break when printing from our css settings. saves preference
        // across sessions using a cookie
        //

        $('input[type="checkbox"]').stickyticky({ cookiePrefix: "printview_" });

        $('input[name="page-break"]').each(function () { that.updatePageBreaks($(this)); });
        $('input[name="page-break"]').change(function () { that.updatePageBreaks($(this)); });
        $('input[name="wider-columns"]').each(function () { that.updateWiderColumns($(this)); });
        $('input[name="wider-columns"]').change(function () { that.updateWiderColumns($(this)); });
        $('input[name="show-instructions"]').each(function () { that.updateShowInstructions($(this)); });
        $('input[name="show-instructions"]').change(function () { that.updateShowInstructions($(this)); });

        this.$el.show();
    },


    errorsSection: function () {
        var that = this;
        return "<table class='SampleErrorsTable'>" + this.columnHeader() +
            this.rowFromGetter(function (sample) {
                var errors = JSON.parse(sample.Errors);
                return that.longErrorMessagesToHtml(errors);
            }, "Warnings or Errors", "", "", false, "string") + "</table>";
    },

    //
    // if any samples use DNA control, we need to display that recipe everywhere
    //
    anyUseSpike: function () {
        var i, sample,
            sampleArray = this.samples;
        for (i = 0; i < sampleArray.length; i += 1) {
            sample = sampleArray[i];
            if (sample.UseSpikeInControl === "True") {
                return true;
            }
        }
        return false;
    },

    //
    // Verifies that all selected types are of the same type and can be printed together
    // Returns: empty string if ok, or error messages otherwise
    // future: move these error strings to calculator.static.js
    //
    mismatchedTypeError: function () {
        var i, errors, sample, sampleTitration,
            sampleArray = this.samples,
            first = sampleArray[0],
            standardness = first.LowConcentrationsAllowed,
            chemistry = first.Chemistry,
            preparation = first.PreparationProtocol,
            storage = first.LongTermStorage,
            magbead = first.MagBead,
            titration = (first.ComputeOption === "Titration"),
            sameStandardness = true,
            sameChemistry = true,
            sameSize = true,
            sameStorage = true,
            sameMagBead = true,
            similarCompute = true;

        for (i = 1 /*skip first element, we're comparing the rest to it */; i < sampleArray.length; i += 1) {
            sample = sampleArray[i];

            if (sample.LowConcentrationsAllowed !== standardness) {
                sameStandardness = false;
            }

            if (sample.Chemistry !== chemistry) {
                sameChemistry = false;
            }

            if (sample.PreparationProtocol !== preparation) {
                sameSize = false;
            }

            if (sample.LongTermStorage !== storage) {
                sameStorage = false;
            }

            if (sample.MagBead !== magbead) {
                sameMagBead = false;
            }

            sampleTitration = (sample.ComputeOption === "Titration");
            if (sampleTitration !== titration) {
                similarCompute = false;
            }
        }

        errors = "";
        if (!sameStandardness) {
            errors += "are standard; ";
        }
        if (!sameChemistry) {
            errors += "use different versions of chemistry; ";
        }
        if (!sameSize) {
            errors += "are large-scale preparations; ";
        }
        if (!sameStorage) {
            errors += "use long-term storage; ";
        }
        if (!sameMagBead) {
            errors += "use different magnetic bead protocols; ";
        }
        if (!similarCompute) {
            errors += "are titrations; ";
        }

        if (errors !== "") {
            errors = "Sorry. We cannot display samples together of different types. " +
                "Some but not all of these samples: " + errors;
        }
        return errors;
    },

    sanitize: function (value, type) {
        var samples = this.model.fetched,
            first = samples[0],
            sanitized = first.sanitize(value, type);

        // for the print view, we switch any True/False responses to be Yes/No
        if (sanitized === "True") {
            sanitized = "Yes";
        }
        if (sanitized === "False") {
            sanitized = "No";
        }

        return sanitized;
    },

    // using a passed function, prepare a single row of a table
    rowFromClosure: function (closure, header, rowclass, head) {
        var index, item, result, values = [];
        for (index in this.samples) {
            if (this.samples.hasOwnProperty(index)) {
                item = this.samples[index];
                values.push(closure(item));
            }
        }
        return this.rowFromArray(values, header, rowclass, head);
    },

    rowFromGetter: function (getter, header, units, rowclass, head, type) {
        var that = this;
        return this.rowFromClosure(function(item) {
            result = getter(item);
            return that.sanitize(result, type) + units;
        }, header, rowclass, head);
    },

    // from an array of values prepare a single row of a table
    rowFromArray: function (valuesArray, header, rowclass, head) {
        var result, index, item,
            tds = (head) ? "<th>" : "<td>",
            tde = (head) ? "</th>" : "</td>",
            tdrh = (head) ? "<th class='rowheader'>" : "<td class='rowheader'>",
            tr = "<tr>";
        if ("" !== rowclass) {
            tr = "<tr class='" + rowclass + "'>";
        }

        result = tr + tdrh + header + tde;
        for (index in valuesArray) {
            if (valuesArray.hasOwnProperty(index)) {
                item = valuesArray[index];
                result += tds + item + tde;
            }
        }

        return result + "</tr>";
    },

    columnHeader: function () {
        var result = this.rowFromGetter(function (sample) {
            return sample.SampleName;
        }, "Sample Name", "", "columnheader", true, "string");
        return result;
    },

    longErrorMessagesToHtml: function (errors) {
        var key, error, result = "";
        for (key in errors) {
            if (errors.hasOwnProperty(key)) {
                error = errors[key];
                result += "<li>" + error.LongMessage + "</li>";
            }
        }
        if ("" !== result) {
            result = "<ul>" + result + "</ul>";
        } else {
            result = "<ul><li>None</li></ul>";
        }
        return result;
    },

    sampleVolumeRow: function () {
        var index, sample,
            samples = this.model.fetched,
            result = "<tr><td class='rowheader'>Volume to Use</td>";

        for (index in samples) {
            if (samples.hasOwnProperty(index)) {
                sample = samples[index];
                if ((sample.ComputeOption === "Cells") || (sample.ComputeOption === "Titration")) {
                    result += "<td class='gray'></td>";
                    continue;
                }

                result += "<td>" + this.sanitize(sample.SampleVolumeToUseInAnnealing, "input") + "</td>";
            }
        }

        return result;
    },

    numCellsRow: function () {
        var index, sample,
            samples = this.model.fetched,
            result = "<tr><td class='rowheader'># of SMRTCells</td>";

        for (index in samples) {
            if (samples.hasOwnProperty(index)) {
                sample = samples[index];

                if ((sample.ComputeOption === "Volume") || (sample.ComputeOption === "Titration")) {
                    result += "<td class='gray'></td>";
                    continue;
                }

                result += "<td>" + this.sanitize(sample.NumberOfCellsToUse, "input") + "</td>";
            }
        }

        return result;
    },

    chemistryNameByType: function (type) {
        if (type === "Version2") {
            return "C2";
        }
        if (type === "VersionXL") {
            return "XL";
        }
        if (type === "VersionP4") {
            return "P4";
        }
        if (type === "VersionP5") {
            return "P5";
        }
        if (type === "VersionP6") {
            return "P6";
        }
        return "Unknown";
    },

    protocolNameByType: function(type){
        if (type === "False") {
            return "Standard";
        }
        if (type === "True") {
            return "MagBead Standard";
        }
        if (type === "OneCellPerWell") {
            return "MagBead OCPW";
        }
        return "Unknown";
    },

    sampleDetailsTable: function () {
        var result,
            that = this,
            samples = this.model.fetched,
            first = samples[0];

        result = "<table class='SampleDetailsTable'>";
        result += this.columnHeader();
        result += this.sampleVolumeRow();
        result += this.numCellsRow();

        result += this.rowFromGetter(function (sample) {
            return sample.StartingSampleConcentration;
        }, "Concentration", " ng/uL", "", false, "input");

        result += this.rowFromGetter(function (sample) {
            return sample.AnnealedBasePairLength;
        }, "Insert size", " bp", "", false, "input");

        result += this.rowFromGetter(function(sample) {
            return sample.SizeSelection;
        }, "Size Selection", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return that.protocolNameByType(sample.MagBead);
        }, "Protocol", "", "", false, "string");

        if (first.ShowChemistryOption) {
            result += this.rowFromGetter(function (sample) {
                return that.chemistryNameByType(sample.Chemistry);
            }, "Binding Kit", "", "", false, "string");
        }

        if (first.ShowCellOption) {
            result += this.rowFromGetter(function (sample) {
                return sample.Cell;
            }, "SMRT Cell", "", "", false, "string");
        }

        result += this.rowFromGetter(function (sample) {
            return sample.PreparationProtocol;
        }, "Preparation", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            // if Large prep protocol, then we always use long term storage
            // just display it as such. True is converted to Yes automatically.
            if (sample.PreparationProtocol === "Large")
                return "True";
            return sample.LongTermStorage;
        }, "Long-Term Storage", "", "", false, "string");

        // strobe option deprecated and removed, was here

        result += this.rowFromGetter(function (sample) {
            return sample.UseSpikeInControl;
        }, "DNA Control", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample.ComplexReuse;
        }, "Complex Reuse", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            // return the opposite of LowConcentrationsAllowed for "Standard"
            return ("True" === sample.LowConcentrationsAllowed) ? "False" : "True";
        }, "Standard Concentration", "", "", false, "string");

        // include Optional information so the print view is a complete archive of sample inputs (bugzilla 25310)'

        result += this.rowFromGetter(function (sample) {
            if ("Default" === sample.ConcentrationOnPlateOption)
                return "Default (" + sample.DefaultConcentrationOnPlate + " nM)";
            return "Custom (" + sample.CustomConcentrationOnPlate + " nM)";
        }, "Concentration On Plate", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            if ("Default" === sample.SpikeInRatioOption)
                return "Default (" + sample.DefaultSpikeInRatioToTemplatePercent + "%)";
            return "Custom (" + sample.CustomSpikeInRatioPercent + "%)";
        }, "Control To Template", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            if ("Default" === sample.PolymeraseTemplateRatioOption)
                return "Default (" + sample.DefaultPolymeraseTemplateRatio + ")";
            return "Custom (" + sample.CustomPolymeraseTemplateRatio + ")";
        }, "Polymerase:Template Ratio", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            if ("Default" === sample.PrimerTemplateRatioOption)
                return "Default (" + sample.DefaultPrimerTemplateRatio + ")";
            return "Custom (" + sample.CustomPrimerTemplateRatio + ")";
        }, "Primer:Template Ratio", "", "", false, "string");

        result += "</table>";

        return result;
    },

    //
    // get the primer and elution volume from the model and present that
    // note: this assumes the model calculated it when it loaded
    //
    annealingSequencingPrimerDilution: function () {
        var result,
            totalVolume = this.model.PrimerAndElutionVolume,
            primerVolume = this.model.PrimerVolume,
            elutionVolume = this.model.ElutionVolume;

        result = "<table class='AnnealingSequencingPrimerDiluation'>";
        result += "<tr><td class='rowheader'>Sequencing Primer</td><td>" + this.sanitize(primerVolume, "volume") + " uL</td></tr>";
        result += "<tr><td class='rowheader'>Elution Buffer</td><td>" + this.sanitize(elutionVolume, "volume") + " uL</td></tr>";
        result += "<tr><td class='rowheader total'>Total Volume</td><td class='total'>" + this.sanitize(totalVolume, "volume") + " uL</td></tr>";
        result += "</table>";
        return result;
    },

    stringFormat: function(format) {
        var args = Array.prototype.slice.call(arguments, 1);
        return format.replace(/{(\d+)}/g, function(match, number) {
            return typeof args[number] != 'undefined'
                ? args[number]
                : match
                ;
        });
    },

    annealingRecipeTable: function () {
        var result = "<table class='AnnealingRecipeTable'>", that = this;
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfWaterInAnnealingReaction;
        }, "Volume H20", " ul", "", false, "volume");
        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfPbInAnnealingReaction;
        }, "10x Primer Buffer", " ul", "", false, "volume");
        result += this.rowFromGetter(function (sample) {
            return sample.SampleVolumeInAnnealingReaction;
        }, "Sample Volume", " ul", "", false, "volume");
        result += this.rowFromGetter(function (sample) {
            return sample.PrimerVolumeInAnnealingReaction;
        }, "Diluted Sequencing Primer", " ul", "", false, "volume");
        result += this.rowFromClosure(function (sample) {
            var vol, concentration;
            vol = that.sanitize(sample.TotalVolumeOfAnnealingReaction, "volume");
            concentration = that.sanitize(sample.FinalAnnealedConcentration, "concentration");
            return that.stringFormat("{0} ul (at&nbsp;{1}&nbsp;nM)", vol, concentration);
        }, "Total Volume", "lineabove", false);

        result += "</table>";
        return result;
    },

    dilutionTableVertical: function() {
        var sample, spikeTubeLabel, spikeTubeSize, polyTubeLabel, polyTubeSize,
            spikeConcentration, polyConcentration, result,
            samples = this.model.fetched,
            first = samples[0],
            spikeTotal = 0,
            spikeVolume = 0,
            spikeBinding = 0,
            polyVolume = 0,
            polyTotal = 0,
            polyBinding = 0,
            usingControl = false,
            i = 0,
            index;

        for (index in samples) {
            if (samples.hasOwnProperty(index)) {
                sample = samples[index];

                if ("True" === sample.UseSpikeInControl) {
                    usingControl = true;
                }

                spikeVolume += parseFloat(sample.DilutedSpikeInVolumeInSecondDilution);
                spikeBinding += parseFloat(sample.BindingBufferInSecondDilution);
                spikeTotal += parseFloat(sample.TotalVolumeOfSecondSpikeInDilution);
                polyVolume += parseFloat(sample.PolymeraseStockVolumeInDilution);
                polyBinding += parseFloat(sample.BindingBufferInPolymeraseDilution);
                polyTotal += parseFloat(sample.TotalVolumeOfPolymeraseDilution);
                i += 1;
            }
        }

        result = "";

        result = "<table class='DilutionTable'>";
        result += "<tr class='columnheader'><th>Polymerase Dilution</th><th>Master Mix</th></tr>";
        result += "<tr><td class='rowheader'>" + first.TubeNamePolymerase + "</td><td>"
                    + this.sanitize(polyVolume, "volume") + " uL</td></tr>";
        result += "<tr><td class='rowheader'>" + first.TubeNameBindingBuffer + "</td><td>"
                    + this.sanitize(polyBinding, "volume") + " uL</td></tr>";
        result += "<tr class='lineabove'><td class='rowheader'>Total Volume</td><td>"
                    + this.sanitize(polyTotal, "volume")
                    + " uL (at&nbsp;"
                    + this.sanitize(first.PolymeraseDilutionConcentration, "concentration")
                    + "&nbsp;nM)</td></tr>";
        result += "</table>";
        return result;
    },

    //
    // We have two different table options. If all samples are "standard" concentration, then
    // we combine the dilutions to save amounts. If the samples are "non-standard" however then
    // their dilution concentrations might all be different so we need to display them individually
    // and customers can compute their own master mixes. Note different pol:template ratios should
    // also trigger different dilutions.
    //
    dilutionTable: function () {
        var first, result, masterMixedDilutions,
            ratio, annealingCon, i, foundsample,
            that=this;

        // standard case
        first = this.model.fetched[0];
        result = "";

        masterMixedDilutions = false;
        if ("False" === first.LowConcentrationsAllowed) {
            masterMixedDilutions = true;
        }

        // check to see if our samples all have the same pol:temp ratio
        // and SampleConcentrationInAnnealingReaction therefore the
        // polymerase concentrations will match and we can master mix them
        // all into one preparation

        ratio = first.PolymeraseTemplateRatio;
        annealingCon = first.SampleConcentrationInAnnealingReaction;

        for (i = 1; i < this.model.fetched.length; i += 1) {
            foundsample = this.model.fetched[i];
            if (ratio !== foundsample.PolymeraseTemplateRatio) {
                masterMixedDilutions = false;
            }
            if (annealingCon != foundsample.SampleConcentrationInAnnealingReaction) {
                masterMixedDilutions = false;
            }
        }

        if (masterMixedDilutions) {
            return this.dilutionTableVertical();
        }

        // non-standard case, show a dilution for each sample

        if ("Version1" === first.Chemistry) {    // deprecated
            return "ERROR - Version 1 chemistry and non-standard dilutions are not supported. Print separately from sample view.";
        }

        result = "<table class='DilutionTable'>";
        result += this.columnHeader();

        result += this.rowFromGetter(function (sample) {
            return sample.TubeNamePolymerase;
        }, "Polymerase Type", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample.PolymeraseStockVolumeInDilution;
        }, "Polymerase", " ul", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.BindingBufferInPolymeraseDilution;
        }, first.TubeNameBindingBuffer, " ul", "", false, "volume");

        result += this.rowFromClosure(function (sample) {
            var vol, concentration;
            vol = that.sanitize(sample.TotalVolumeOfPolymeraseDilution, "volume");
            concentration = that.sanitize(sample.PolymeraseDilutionConcentration, "concentration");
            return that.stringFormat("{0} ul (at&nbsp;{1}&nbsp;nM)", vol, concentration);
        }, "Total Volume", "lineabove", false);

        result += "</table>";

        return result;
    },

    bindingPolymeraseTable: function () {
        var first = this.model.fetched[0],
            result = "<table class='BindingPolymeraseTable'>",
            that = this;

        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfAnalogsInBinding;
        }, first.TubeNameNucleotides, " ul", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfDttInBinding;
        }, first.TubeNameDtt, " ul", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.BindingBufferInBinding;
        }, first.TubeNameBindingBuffer, " ul", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfAnnealingReactionInBinding;
        }, "Annealed Template", " ul", "", false, "volume");

        if (first.Chemistry === "Version1") {    // deprecated
            result += this.rowFromGetter(function (sample) {
                return sample.SpikeInTubeLabel;
            }, "DNA Control Tube #", " ul", "lineabove", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.VolumeOfSpikeInDilutionInBinding;
            }, "DNA Control Dilution", " ul", "", false, "volume");
        }

        // master mix is across all buckets now, no longer needed
        //result += this.rowFromGetter(function (sample) {
        //    return sample.PolymeraseTubeInsertSize + " Polymerase";
        //}, "Dilution", "", "lineabove", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfPolymeraseDilutionInBinding;
        }, "Polymerase Dilution", " ul", "", false, "volume");

        result += this.rowFromClosure(function (sample) {
            var vol, concentration;
            vol = that.sanitize(sample.TotalVolumeOfBindingReaction, "volume");
            concentration = that.sanitize(sample.FinalBindingConcentration, "concentration");
            return that.stringFormat("{0} ul (at&nbsp;{1}&nbsp;nM)", vol, concentration);
        }, "Total Volume", "lineabove", false);

        result += this.rowFromGetter(function (sample) {
            return sample.NumberOfCellsFromBinding;
        }, "# of SMRT Cells", "", "", false, "string");

        result += "</table>";
        return result;
    },

    anyLongTermStorage: function () {
        var samples, i, sample;

        samples = this.model.fetched;
        for (i = 0; i < samples.length; i += 1) {
            sample = samples[i];
            if ("Large" === sample.PreparationProtocol) {
                return true;
            }
            if ("True" === sample.LongTermStorage) {
                return true;
            }
        }
        return false;
    },

    longTermStorage: function () {
        var first, result, that = this;
        first = this.model.fetched[0];
        result = "<table class='LongTermStorage'>";
        result += this.columnHeader();

        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfDttInStorageComplex;
        }, first.TubeNameDtt, " ul", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfComplexDilutionBufferInStorageComplex;
        }, first.TubeNameComplexStorageBuffer, " ul", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.VolumeOfBindingReactionInStorageComplex;
        }, "Binding Complex", " ul", "", false, "volume");

        result += this.rowFromClosure(function (sample) {
            var vol, concentration;
            vol = that.sanitize(sample.TotalVolumeOfStorageComplex, "volume");
            concentration = that.sanitize(sample.FinalStorageConcentration, "concentration");
            return that.stringFormat("{0} ul (at&nbsp;{1}&nbsp;nM)", vol, concentration);
        }, "Total Volume", "lineabove", false);

        result += "</table>";
        return result;
    },

    anyTitrations: function () {
        var samples, i, sample;

        samples = this.model.fetched;
        for (i = 0; i < samples.length; i += 1) {
            sample = samples[i];
            if ("Titration" === sample.ComputeOption) {
                return true;
            }
        }
        return false;
    },

    //
    // standard DNA control dilution shared between titrations and using binding complex sections
    // note: this assumes spike is true, doesn't test it again like the C# version did
    //
    spikeInDilution: function () {
        var result, first, magbead;
        result = "";
        first = this.model.fetched[0];
        magbead = (first.MagBead === "True" || first.MagBead === "OneCellPerWell");

        if (magbead) {

            result += "<p>DNA Control Dilution:</p><p>1. First Dilution</p><table class='SpikeInForBoundComplexTable'>";
            result += this.columnHeader();
            result += this.rowFromGetter(function (sample) {
                return sample.MagBeadSpikeInDilutionVolumeOfFirstBindingBuffer;
            }, "MagBead Binding Buffer", " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.MagBeadSpikeInDilutionVolumeOfFirstStockSpikeIn;
            }, "Stock DNA Control", " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.MagBeadSpikeInFirstDilutionVolumeTotal;
            }, "Total Volume", " uL", "lineabove", false, "volume");

            result += "</table>";

            result += "<p>2. Second Dilution</p><table class='SpikeInForBoundComplexTable'>";
            result += this.rowFromGetter(function (sample) {
                return sample.MagBeadSpikeInDilutionVolumeOfSecondBindingBuffer;
            }, "MagBead Binding Buffer", " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.MagBeadSpikeInDilutionVolumeOfFirstDilution;
            }, "First Dilution", " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.MagBeadSpikeInSecondDilutionVolumeTotal;
            }, "Total Volume", " uL", "lineabove", false, "volume");

            result += "</table>";

        } else {

            result += "<p>DNA Control Dilutions:</p><table class='SpikeInForBoundComplexTable'>";
            result += this.columnHeader();
            result += this.rowFromGetter(function (sample) {
                return sample.DttVolumeInSpikeInDilution;
            }, first.TubeNameDtt, " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.ComplexDilutionBufferVolumeInSpikeInDilution;
            }, first.TubeNameComplexDilutionBuffer, " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.SpikeInTubeLabel;
            }, "DNA Control Tube", "", "", false, "string");

            result += this.rowFromGetter(function (sample) {
                return sample.SpikeInControlContribution;
            }, "DNA Control", " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.SpikeInDilutionVolume;
            }, "Total Volume", " uL", "lineabove", false, "volume");

            result += "</table>";
        }

        return result;
    },

    loadingTitrationTable: function () {
        var prep1, prep2, prep3, prep4,
            result, first, magbead, titration,
            spike;

        result = "";
        first = this.model.fetched[0];
        magbead = (first.MagBead === "True" || first.MagBead === "OneCellPerWell");

        titration = (first.ComputeOption === "Titration");
        if (!titration) {
            return result;
        }

        spike = false;
        if (this.someSampleUsesSpike) {
            spike = (first.Chemistry !== "Version1");
        }

        if (spike) {
            result += this.spikeInDilution();
        }

        if (magbead) {
            prep1 = this.magBeadPreparation("MagBeadTitration1");
            prep2 = this.magBeadPreparation("MagBeadTitration2");
            prep3 = this.magBeadPreparation("MagBeadTitration3");
            prep4 = this.magBeadPreparation("MagBeadTitration4");
        } else {
            prep1 = this.titrationPreparation("Titration1", first, spike);
            prep2 = this.titrationPreparation("Titration2", first, spike);
            prep3 = this.titrationPreparation("Titration3", first, spike);
            prep4 = this.titrationPreparation("Titration4", first, spike);
        }

        result += "<h4>Titration 1</h4><table class='LoadingTitrationTable'>";
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return "Titration at " + sample.TitrationConcentration1 + " nM";
        }, "", "", "lineabove", false, "string");

        result += prep1;
        result += "</table><div class='potential_page_break'></div><h4>Titration 2</h4><table class='LoadingTitrationTable'>";
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return "Titration at " + sample.TitrationConcentration2 + " nM";
        }, "", "", "lineabove", false, "string");

        result += prep2;
        result += "</table><div class='potential_page_break'></div><h4>Titration 3</h4><table class='LoadingTitrationTable'>";
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return "Titration at " + sample.TitrationConcentration3 + " nM";
        }, "", "", "lineabove", false, "string");

        result += prep3;
        result += "</table><div class='potential_page_break'></div><h4>Titration 4</h4><table class='LoadingTitrationTable'>";
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return "Titration at " + sample.TitrationConcentration4 + " nM";
        }, "", "", "lineabove", false, "string");

        result += prep4;

        return result;
    },

    //
    // standard table rows for non-magbead titrations
    //
    titrationPreparation: function (which, first, spike) {

        var result = "";
        result += this.rowFromGetter(function (sample) {
            return sample[which].Dtt;
        }, first.TubeNameDtt, " uL", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample[which].TitrationComplexDilutionBuffer;
        }, first.TubeNameComplexDilutionBuffer, " uL", "", false, "volume");


        if (spike) {
            result += this.rowFromGetter(function (sample) {
                return sample[which].TitrationSpikeInVolume;
            }, "DNA Control Volume", " uL", "", false, "volume");
        }


        result += this.rowFromGetter(function (sample) {
            return sample[which].TitrationBindingComplex;
        }, "Binding Complex", " uL", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample[which].TitrationTotal;
        }, "Total Volume", " uL", "", false, "volume");

        return result;

    },

    //
    // standard table rows for magbead prep. shared between titrations and regular preparations
    //
    magBeadPreparation: function (which) {

        var result = "", that = this;
        if (this.anyLongTermStorage()) {
            result += this.rowFromGetter(function () { return ""; }, "<i>First Complex Dilution</i>", "", "", false, "string");

            result += this.rowFromGetter(function (sample) {
                return sample[which].MagBeadComplexDilutionVolumeOfFirstBindingBuffer;
            }, "MagBead Binding Buffer", " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample[which].MagBeadComplexDilutionVolumeOfFirstComplex;
            }, "Complex", " uL", "", false, "volume");

            result += this.rowFromGetter(function () { return ""; }, "<i>Second Complex Dilution</i>", "", "", false, "string");
        }

        result += this.rowFromGetter(function (sample) {
            return sample[which].MagBeadComplexDilutionVolumeOfSaltBuffer;
        }, "MagBead Wash Buffer", " uL", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample[which].MagBeadComplexDilutionVolumeOfSecondBindingBuffer;
        }, "MagBead Binding Buffer", " uL", "", false, "volume");

        // For 2.3.0.0, we add the P6 DNA control below diffusion loaded instead of here
        first = this.model.fetched[0];
        if (first.Chemistry !== "VersionP6") {
            result += this.rowFromGetter(function (sample) {
                return sample[which].MagBeadComplexDilutionVolumeOfSpikeInDilution;
            }, "DNA Control Second Dilution", " uL", "", false, "volume");
        }

        result += this.rowFromGetter(function (sample) {
            return sample[which].MagBeadComplexDilutionVolumeOfSecondComplex;
        }, "Sample Complex", " uL", "", false, "volume");

        result += this.rowFromClosure(function (sample) {
            var vol, concentration;
            vol = that.sanitize(sample[which].MagBeadComplexDilutionVolumeTotal, "volume");
            concentration = that.sanitize(sample[which].SampleConcentrationOnPlate, "concentration");
            return that.stringFormat("{0} ul (at&nbsp;{1}&nbsp;nM)", vol, concentration);
        }, "Total Volume", "lineabove", false);

        // mag bead preps

        result += "</table><h5>Magnetic Beads (Keep cold)</h5>";
        result += "<p>MagBead Step 1. Wash.</p><table " +
            "class='UsingBoundComplexMagBeadSections'>";

        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return sample[which].BeadWashVolumeOfBeads;
        }, "Add MagBeads to empty tube", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "Collect beads. Remove supernatant and discard", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample[which].BeadWashVolumeOfBeadWashBuffer;
        }, "Add MagBead Wash Buffer and wash <span class='instructions'>by slowly aspirating and dispensing 10 times</span>", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "Collect beads. Remove supernatant and discard", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample[which].BeadWashVolumeOfBeadBindingBuffer;
        }, "Add MagBead Binding Buffer and mix <span class='instructions'>by slowly aspirating and dispensing 10 times</span>", " uL", "", false, "volume");


        result += "</table><p>MagBead Step 2. Incubate Bead-Complex. <span class='instructions'>Place the indicated " +
             "amount of washed beads to a new tube and add diluted complex. Mix by slowly aspirating and dispensing 10 times." +
             "</span></p><table class='UsingBoundComplexMagBeadSections'>";

        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return sample[which].ComplexBeadIncubationVolumeOfWashedBeads;
        }, "Washed beads to new tube", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "<b><i>Collect beads. Remove supernatant and discard</i></b>", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample[which].ComplexBeadIncubationVolumeOfComplex;
        }, "Add diluted sample complex", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "And mix by slowly aspirating and dispensing 10 times", "", "", false, "string");


        result += "</table><p>MagBead Step 3. Incubate in a rotator <span class='instructions'>at 4C "+
            "for 20 minutes (up to 2 hours).</span></p>";

        result += "<div class=\"potential_page_break\"></div>";

        result += "</table><p>MagBead Step 4. Wash Bead-Complex. <span class='instructions'>Wash " +
            "MagBead complex as follows:</span></p><table class='UsingBoundComplexMagBeadSections'>";

        result += this.columnHeader();
        result += this.rowFromGetter(function () {
            return "";
        }, "Collect beads. Remove supernatant and discard" +
        "<span class='instructions'>. <i>Optional:</i> save 5 uL of supernatant for QC purposes</span>", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample[which].ComplexBeadWashVolumeOfFirstBindingBuffer;
        }, "Add MagBead Binding Buffer and mix <span class='instructions'>by slowly aspirating and dispensing 10 times</span>", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "Collect beads. Remove supernatant and discard", "", "", false, "string");

        result += this.rowFromGetter(function (sample) {
            return sample[which].ComplexBeadWashVolumeOfBeadWashBuffer;
        }, "Add MagBead Wash Buffer and wash <span class='instructions'>by slowly aspirating and dispensing 10 times</span>", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "Collect beads. Remove supernatant and discard", "", "", false, "string");

        // For 2.3.0.0, we add the P6 DNA control here diffusion loaded instead of above
        if (first.Chemistry === "VersionP6") {
            result += this.rowFromGetter(function (sample) {
                return sample[which].MagBeadComplexDilutionVolumeOfSpikeInDilution;
            }, "DNA Control Dilution", " uL", "", false, "volume");
        }

        result += this.rowFromGetter(function (sample) {
            return sample[which].ComplexBeadWashVolumeOfSecondBindingBuffer;
        }, "Add MagBead Binding Buffer and mix <span class='instructions'>by slowly aspirating and dispensing 10 times</span>", " uL", "", false, "volume");

        result += this.rowFromGetter(function () {
            return "";
        }, "<i>keep at 4C until use</i>", "", "", false, "string");

        result += "</table>";

        return result;
    },

    usingBoundComplexTable: function () {
        var first, magbead, result, spike, titration, that = this;

        first = this.model.fetched[0];
        magbead = (first.MagBead === "True" || first.MagBead === "OneCellPerWell");
        titration = (first.ComputeOption === "Titration");
        result = "";

        spike = false;
        if (this.someSampleUsesSpike) {
            spike = (first.Chemistry !== "Version1");
        }

        if (spike) {
            result += this.spikeInDilution();
        }

        result += "<p class='instructions'>Preparation by number of SMRT Cells:</p><table class='UsingBoundComplexTable'>";
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return sample.BindingComplexNumberOfCellsRequested;
        }, "# of SMRT Cells", "", "", false, "string");

        if (!magbead) {

            // non-magbead case is simple
            result += this.rowFromGetter(function (sample) {
                return sample.VolumeOfDttInComplexDilution;
            }, first.TubeNameDtt, " uL", "", false, "volume");

            result += this.rowFromGetter(function (sample) {
                return sample.VolumeOfComplexDilutionBufferInComplexDilution;
            }, first.TubeNameComplexDilutionBuffer, " uL", "", false, "volume");


            if (spike) {
                result += this.rowFromGetter(function (sample) {
                    return sample.VolumeOfSpikeInDilutionInComplexDilution;
                }, "DNA Control Dilution", " uL", "", false, "volume");
            }

            result += this.rowFromGetter(function (sample) {
                return sample.VolumeOfBindingReactionInComplexDilution;
            }, "Binding Complex", " uL", "", false, "volume");

            result += this.rowFromClosure(function (sample) {
                var vol, concentration;
                vol = that.sanitize(sample.TotalComplexDilutionVolume, "volume");
                concentration = that.sanitize(sample.ConcentrationOnPlate, "concentration");
                return that.stringFormat("{0} ul (at&nbsp;{1}&nbsp;nM)", vol, concentration);
            }, "Total Volume", "lineabove", false);

            result += this.rowFromGetter(function (sample) {
                return sample.TotalComplexDilutionCells;
            }, "# of SMRT Cells", "", "", false, "integer");

            result += "</table>";

        } else {
            // magbead case is shared with the titration case
            if (!titration)
                result += this.magBeadPreparation("MagBeadCalculations");
        }

        return result;
    },

    Step8Text: function() {
        var first = this.model.fetched[0];
        return first.Step8Text;
    },

    Step9Text: function () {
        var first = this.model.fetched[0];
        return first.Step9Text;
    },

    plateLayout: function () {
        //
        // Finish with the sample plate well allocations
        //

        var result = "";
        result += "<h4 class='instructions'>Sample Plate Wells</h4><table class='PlateLayout'>";
        result += this.columnHeader();
        result += this.rowFromGetter(function (sample) {
            return sample.DisplayNumberOfFullWells;
        }, "# of Max Volume Wells", "", "lineabove", false, "integer");

        result += this.rowFromGetter(function (sample) {
            return sample.DisplayMaxVolumePerWell;
        }, "Volume / Well", " uL", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.DisplayMaxNumberOfCellsPerWell;
        }, "# of SMRT Cells / Well", "", "", false, "integer");

        result += this.rowFromGetter(function (sample) {
            return sample.DisplayNumberOfPartialWells;
        }, "# of Partial Wells", "", "lineabove", false, "integer");

        result += this.rowFromGetter(function (sample) {
            return sample.DisplayVolumePerPartialWell;
        }, "Volume / Well", " uL", "", false, "volume");

        result += this.rowFromGetter(function (sample) {
            return sample.DisplayNumberOfCellsPerPartialWell;
        }, "# of SMRT Cells / Well", "", "", false, "integer");

        result += "</table>";
        return result;
    },

    updatePageBreaks: function (checkbox) {
        var state = (checkbox) ? checkbox.prop('checked') : false;
        if (state) {
            $('.potential_page_break').addClass('page-break');
        } else {
            $('.potential_page_break').removeClass('page-break');
        }
    },

    updateShowInstructions: function (checkbox) {
        var state = (checkbox) ? checkbox.prop('checked') : false;
        if (state) {
            $('.instructions').show();
        } else {
            $('.instructions').hide();
        }
    },

    updateWiderColumns: function (checkbox) {
        var state, width, px, warn;

        state = (checkbox) ? checkbox.prop('checked') : false;

        width = 70;
        if (state) {
            width = 140;
        }

        px = width + "px";
        warn = (width - 10) + "px";

        $('table td').add('table .rowheader').add('table .columnheader th').
            not('#print-options td').not('.DilutionTable th').not('.DilutionTable td').
            css({ "width": px, "min-width": px, "max-width": px });
        $('td ul li ').not('.DilutionTable th').not('.DilutionTable td').css({ "max-width": warn });
        $('table .rowheader').not('.DilutionTable th').not('.DilutionTable td').
            css({ "width": "150px", "min-width": "150px", "max-width": "150px" });
    },

    render: function (names) {
        var names_array, nameslist, index;

        //
        // names come to us encoded and separated with "&" characters, and with a 
        // trailing "&"
        //

        names = names.replace(/\&+$/, "");              // strip trailing &
        names_array = names.split("&");
        nameslist = [];
        for (index in names_array) {
            if (names_array.hasOwnProperty(index)) {
                nameslist.push(decodeURIComponent(names_array[index]));
            }
        }

        // print view is all white
        $('body').css('background', "#FFFFFF");
        this.$el.html("Print view loading for " + nameslist.concat());

        // load the content
        this.model.loadSamples(nameslist);
    }
});

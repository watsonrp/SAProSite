// use Amazon Cognito to get temporary credentials
AWS.config.update({
    region: '<replace with your region>',
    credentials: new AWS.CognitoIdentityCredentials({
        AccountId: '<replace with your 12 digit account ID>',
        RoleArn: '<replace with your Cognito Role>',
        IdentityPoolId: '<replace with your Cognito Pool ID>'
    })
});
AWS.config.credentials.get(function (err) {
    if (err) {
        $("#err").html(err);
    }
});

function toggleQueryButton(label) {
    $("#queryBtn").html(label);
    $("#queryBtn").toggleClass("btn-danger");
    $("#queryBtn").toggleClass("btn-success");
}

// "Try Again" query button
$("#queryAgain").click(function (event) {
    $("#chart").toggleClass("hidden");
    $("#tryAgain").toggleClass("hidden");
    $("#queryForm").toggleClass("hidden");
    toggleQueryButton("Query Redshift");
});

$("#queryForm").submit(function (event) {
    var queries = [
        { x: "dest", y: "avgdelay", title:"Top 10 airports most prone to departure delays", query: "Select Dest, Nvl(Round(Avg(ArrDelay),2),0) AvgDelay From Departures group by Dest Having Nvl(Round(Avg(ArrDelay),2),0) > 0 order by 2 Desc limit 10;" },
        { x: "origin", y: "avgdelay", title: "Top 10 airports most prone to arrival delays", query: "Select Origin, Nvl(Round(Avg(DepDelay),2),0) AvgDelay From Departures group by origin Having Nvl(Round(Avg(DepDelay),2),0) > 0 order by 2 Desc limit 10;" },
        { x: "week", y: "avgdelay", title: "Top 10 weeks most susceptible to departure/arrival delay", query: "Select Extract(Week from cast(flightdate as date)) as week, Round(Avg(depdelay),2) as avgdelay From Departures Where DepDelay > 0 Group By Extract(Week from cast(flightdate as date)) Order By 2 Desc limit 10;" }
    ]
    // prevent the form for submitting right away
    event.preventDefault();
    var qval = $("#redshiftQuery").val() - 1

    // cosmetic changes so the user is aware that the query is running
    toggleQueryButton("Querying...");

    for (var chartNumber = 1; chartNumber < 2; chartNumber++) {
        // build the JSON object that we'll pass to AWS Lambda as an "event"
        var lambdaEvent = '{'
        + '"redshiftUser": "' + $("#redshiftUser").val()
        + '", "redshiftPassword": "' + $("#redshiftPassword").val()
        + '", "redshiftEndpoint": "' + $("#redshiftEndpoint").val()
        + '", "redshiftPort": "' + $("#redshiftPort").val()
        + '", "redshiftDatabase": "' + $("#redshiftDatabase").val()
        + '", "query": "'
        + queries[qval].query
        + '"}';



        // invoke the AWS Lambda function with the event above
        var lambda = new AWS.Lambda();
        var params = {
            FunctionName: 'redshiftLambda',
            InvocationType: 'RequestResponse',
            LogType: 'None',
            Payload: lambdaEvent
        };
        lambda.invoke(params, function (err, data) {
            if (err) {
                $("#err").html(err);
                toggleQueryButton("Query Redshift");
            }
            else {
                // parse the data returned by Lambda
                results = jQuery.parseJSON(data.Payload);
                if (results.errorMessage) {
                    $("#err").html(results.errorMessage);
                    toggleQueryButton("Query Redshift");
                }
                else {
                    // show the Plottable chart and "New Query" button
                    // then call the chart building function, passing the data returned from Lambda
                    $("#tryAgain").toggleClass("hidden");
                    $("#queryForm").toggleClass("hidden");
                    $("#chart").toggleClass("hidden");
                    $("#err").empty() // clear any previous errors
                    drawChart(
                      results,
                      queries[qval].title,
                      queries[qval].x,
                      queries[qval].y
                      );
                }
            }
        });

    }
});

// called after AWS Lambda function to write the D3/Plottable chart to the SVG anchor in the HTML
function drawChart(data, chartTitle, x, y) {
    // Scales
    var xScale = new Plottable.Scale.Category();
    var xAxis = new Plottable.Axis.Category(xScale,"bottom")
    var yScale = new Plottable.Scale.Linear();
    var yAxis = new Plottable.Axis.Numeric(yScale, "left");

    // Plot Components
    var title = new Plottable.Component.TitleLabel(chartTitle);
    var plot = new Plottable.Plot.Bar(xScale, yScale, true)
    .addDataset(data.rows)
    .project("x", x, xScale)
    .project("y", y, yScale)
    .animate(true);

    // layout
    theChart = new Plottable.Component.Table([
      [null, title],
      [yAxis, plot],
      [null, xAxis]
    ])

    // reset the chart in case it was already drawn
    $("#chart").html('<svg width="100%" height="300" id="barChart"/>');

    // draw the chart
    theChart.renderTo("svg#barChart");

    // Make sure rects are ready in the SVG
    Plottable.Core.RenderController.flush();

    // Attach tooltips with qTip2 (which uses the "title" attribute by default)
    $("svg#barChart .tooltipped rect").qtip({
        position: {
            my: "bottom middle",
            at: "top middle"
        },
        style: {
            classes: "qtip-bootstrap"
        }
    });
}